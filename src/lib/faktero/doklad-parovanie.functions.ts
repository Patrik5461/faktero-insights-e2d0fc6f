import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sparujDoklady, type Pohyb, type Vydavok } from "./doklad-parovanie";

/**
 * Návrhy a potvrdzovanie párovania naskenovaných dokladov s pohybmi na účte.
 *
 * Čítanie aj zápis idú cez klienta prihláseného človeka, takže sa o firmu
 * stará RLS — vlastné overovanie `company_id` by bola druhá, slabšia poistka
 * na tom istom mieste.
 *
 * Nič sa nepáruje samo od seba: aj dvojica označená za istú sa len ponúkne.
 * Bloček je malá suma a zle spárovaný náklad sa v účtovníctve hľadá ťažko.
 */

/** Ako ďaleko dozadu sa hľadá. Starší bloček už nikto nepáruje. */
const DNI_DOZADU = 60;

function predDnami(dni: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dni);
  return d.toISOString().slice(0, 10);
}

export const navrhniParovanieDokladov = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ company_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const od = predDnami(DNI_DOZADU);

    const [{ data: doklady }, { data: pohyby }] = await Promise.all([
      supabase
        .from("expense_documents")
        .select(
          "id, supplier_name, document_number, issue_date, total_amount, currency, payment_method",
        )
        .eq("company_id", data.company_id)
        .gte("issue_date", od)
        // Hotovosť sa v banke neobjaví, tak ju netreba ani ťahať.
        .neq("payment_method", "hotovost")
        .order("issue_date", { ascending: false })
        .limit(300),
      supabase
        .from("bank_transactions")
        .select(
          "id, booking_date, amount, currency, variable_symbol, counterparty, description, bank_account_id",
        )
        .eq("company_id", data.company_id)
        .gte("booking_date", od)
        // Pohyb, ktorý už niečo uhrádza, nemá čo uhrádzať druhýkrát.
        .is("matched_expense_id", null)
        .is("matched_invoice_id", null)
        // Transakčná daň či pohyb označený „bez dokladu“ doklad nehľadá.
        .is("vybavenie", null)
        .lt("amount", 0)
        .order("booking_date", { ascending: false })
        .limit(500),
    ]);

    // Doklad, ktorý už pohyb má, sa znova neponúka.
    const { data: uzSparovane } = await supabase
      .from("bank_transactions")
      .select("matched_expense_id")
      .eq("company_id", data.company_id)
      .not("matched_expense_id", "is", null);
    const obsadene = new Set(
      ((uzSparovane as { matched_expense_id: string }[]) ?? []).map((r) => r.matched_expense_id),
    );

    const vydavky = ((doklady as Vydavok[]) ?? []).filter((v) => !obsadene.has(v.id));
    // Bankové účty → Nastavenia banky: párovať podľa typu platby, alebo ho ignorovať (predvolené).
    const { data: firma } = await supabase
      .from("companies")
      .select("uctovanie_nastavenia")
      .eq("id", data.company_id)
      .maybeSingle();
    const { nastaveniaBanky } = await import("./export-nastavenia");
    const { ignorovatTypPlatby } = nastaveniaBanky(firma?.uctovanie_nastavenia);
    const zhody = sparujDoklady(
      ((pohyby as unknown as Pohyb[]) ?? []).map((p) => ({ ...p, amount: Number(p.amount) })),
      vydavky.map((v) => ({
        ...v,
        total_amount: v.total_amount == null ? null : Number(v.total_amount),
      })),
      ignorovatTypPlatby,
    );

    // Do odpovede patrí aj to, čo je v dvojici — inak by zoznam ukazoval
    // identifikátory a človek by nevedel, čo potvrdzuje.
    const dokladPodlaId = new Map(vydavky.map((v) => [v.id, v]));
    const pohybPodlaId = new Map(((pohyby as unknown as Pohyb[]) ?? []).map((p) => [p.id, p]));

    /*
      Názov účtu do okienka pri ikonke platby — a zároveň odpoveď na otázku,
      či firma vôbec nejaký účet má. Bez účtu sa „platba sa nenašla“ nehlási:
      nebolo by kde ju hľadať.
    */
    const ucty = await nazvyUctov(supabase, data.company_id);

    return {
      maUcet: ucty.size > 0,
      /** Staršie doklady sa nehľadajú — „platba sa nenašla“ sa pri nich nehlási. */
      hladaneOd: od,
      zhody: zhody.map((z) => {
        const p = pohybPodlaId.get(z.transactionId) as
          | (Pohyb & { bank_account_id?: string | null })
          | undefined;
        return {
          ...z,
          doklad: dokladPodlaId.get(z.expenseId) ?? null,
          pohyb: p ? { ...p, ucet: p.bank_account_id ? (ucty.get(p.bank_account_id) ?? null) : null } : null,
        };
      }),
    };
  });

/** Názvy bankových účtov firmy (RLS) — názov, inak IBAN. */
async function nazvyUctov(
  supabase: { from: (t: "bank_accounts") => any },
  companyId: string,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("bank_accounts")
    .select("id, account_name, iban")
    .eq("company_id", companyId);
  return new Map(
    ((data as { id: string; account_name: string | null; iban: string | null }[]) ?? []).map(
      (u) => [u.id, u.account_name || u.iban || ""],
    ),
  );
}

export const potvrdParovanieDokladu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ transaction_id: z.string().uuid(), expense_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    /*
      Doklad aj pohyb musia patriť tej istej firme. RLS pustí len vlastné
      riadky, ale každý zvlášť — bez tejto kontroly by sa na pohyb jednej
      firmy dal priviazať doklad inej firmy toho istého človeka. Hotovosť sa
      v banke neobjaví, tak ju nepáruje ani klik.
    */
    const [{ data: doklad }, { data: pohyb }] = await Promise.all([
      supabase
        .from("expense_documents")
        .select("id, company_id, payment_method")
        .eq("id", data.expense_id)
        .maybeSingle(),
      supabase
        .from("bank_transactions")
        .select("id, company_id, amount")
        .eq("id", data.transaction_id)
        .maybeSingle(),
    ]);
    if (!doklad || !pohyb) throw new Error("Doklad alebo pohyb sa nenašiel.");
    if (doklad.company_id !== pohyb.company_id) {
      throw new Error("Doklad a pohyb nepatria tej istej firme.");
    }
    if (doklad.payment_method === "hotovost") {
      throw new Error("Doklad platený v hotovosti sa s pohybom na účte nepáruje.");
    }
    if (Number(pohyb.amount) >= 0) throw new Error("K dokladu patrí len odchádzajúca platba.");
    // Doklad už uhradený iným pohybom sa druhýkrát neuhrádza.
    const { data: inyPohyb } = await supabase
      .from("bank_transactions")
      .select("id")
      .eq("matched_expense_id", data.expense_id)
      .neq("id", data.transaction_id)
      .limit(1);
    if (inyPohyb?.length) throw new Error("Doklad je už spárovaný s iným pohybom.");
    /*
      Podmienka `is null` je tu naschvál: keby medzitým ten istý pohyb spároval
      niekto iný (alebo druhé ťuknutie), zápis neprepíše hotovú väzbu, ale
      neurobí nič — a to sa dá povedať nahlas.
    */
    const { data: zmenene, error } = await supabase
      .from("bank_transactions")
      .update({ matched_expense_id: data.expense_id })
      .eq("id", data.transaction_id)
      .is("matched_expense_id", null)
      .is("matched_invoice_id", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!zmenene?.length) throw new Error("Tento pohyb je už spárovaný s iným dokladom.");
    return { ok: true };
  });

export const zrusParovanieDokladu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        transaction_id: z.string().uuid(),
        /** Keď príde, zruší sa väzba len ak pohyb stále uhrádza práve tento doklad. */
        expense_id: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("bank_transactions")
      .update({ matched_expense_id: null })
      .eq("id", data.transaction_id);
    if (data.expense_id) q = q.eq("matched_expense_id", data.expense_id);
    const { data: zmenene, error } = await q.select("id");
    if (error) throw new Error(error.message);
    if (data.expense_id && !zmenene?.length) {
      throw new Error("Tento pohyb už doklad neuhrádza — obnovte zoznam.");
    }
    return { ok: true };
  });

export type UhradaDokladu = {
  datum: string;
  transactionId: string;
  suma?: number;
  mena?: string | null;
  vs?: string | null;
  protistrana?: string | null;
  bankAccountId?: string | null;
  ucet?: string | null;
};

/**
 * Ktoré doklady zo zoznamu sú uhradené z účtu.
 *
 * Vracia aj identifikátor pohybu, nielen dátum — bez neho by sa párovanie
 * nedalo zrušiť odtiaľ, kde je vidieť.
 */
export const uhradyDokladov = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({ company_id: z.string().uuid(), ids: z.array(z.string().uuid()).max(200) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    if (!data.ids.length) {
      return { uhrady: {} as Record<string, UhradaDokladu> };
    }
    const { data: rows } = await context.supabase
      .from("bank_transactions")
      .select(
        "id, matched_expense_id, booking_date, amount, currency, variable_symbol, counterparty, bank_account_id",
      )
      .eq("company_id", data.company_id)
      .in("matched_expense_id", data.ids);
    const zoznam =
      (rows as {
        id: string;
        matched_expense_id: string;
        booking_date: string;
        amount: number | string;
        currency: string | null;
        variable_symbol: string | null;
        counterparty: string | null;
        bank_account_id: string | null;
      }[]) ?? [];
    const ucty = zoznam.length
      ? await nazvyUctov(context.supabase, data.company_id)
      : new Map<string, string>();
    const uhrady: Record<string, UhradaDokladu> = {};
    for (const r of zoznam) {
      uhrady[r.matched_expense_id] = {
        datum: r.booking_date,
        transactionId: r.id,
        suma: Number(r.amount),
        mena: r.currency,
        vs: r.variable_symbol,
        protistrana: r.counterparty,
        bankAccountId: r.bank_account_id,
        ucet: r.bank_account_id ? (ucty.get(r.bank_account_id) ?? null) : null,
      };
    }
    return { uhrady };
  });
