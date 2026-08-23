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
        .select("id, booking_date, amount, currency, variable_symbol, counterparty, description")
        .eq("company_id", data.company_id)
        .gte("booking_date", od)
        // Pohyb, ktorý už niečo uhrádza, nemá čo uhrádzať druhýkrát.
        .is("matched_expense_id", null)
        .is("matched_invoice_id", null)
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
    const zhody = sparujDoklady(
      ((pohyby as unknown as Pohyb[]) ?? []).map((p) => ({ ...p, amount: Number(p.amount) })),
      vydavky.map((v) => ({
        ...v,
        total_amount: v.total_amount == null ? null : Number(v.total_amount),
      })),
    );

    // Do odpovede patrí aj to, čo je v dvojici — inak by zoznam ukazoval
    // identifikátory a človek by nevedel, čo potvrdzuje.
    const dokladPodlaId = new Map(vydavky.map((v) => [v.id, v]));
    const pohybPodlaId = new Map(((pohyby as unknown as Pohyb[]) ?? []).map((p) => [p.id, p]));

    return {
      zhody: zhody.map((z) => ({
        ...z,
        doklad: dokladPodlaId.get(z.expenseId) ?? null,
        pohyb: pohybPodlaId.get(z.transactionId) ?? null,
      })),
    };
  });

export const potvrdParovanieDokladu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ transaction_id: z.string().uuid(), expense_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
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
      .select("id");
    if (error) throw new Error(error.message);
    if (!zmenene?.length) throw new Error("Tento pohyb je už spárovaný s iným dokladom.");
    return { ok: true };
  });

export const zrusParovanieDokladu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ transaction_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("bank_transactions")
      .update({ matched_expense_id: null })
      .eq("id", data.transaction_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

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
      return { uhrady: {} as Record<string, { datum: string; transactionId: string }> };
    }
    const { data: rows } = await context.supabase
      .from("bank_transactions")
      .select("id, matched_expense_id, booking_date")
      .eq("company_id", data.company_id)
      .in("matched_expense_id", data.ids);
    const uhrady: Record<string, { datum: string; transactionId: string }> = {};
    for (const r of (rows as { id: string; matched_expense_id: string; booking_date: string }[]) ??
      []) {
      uhrady[r.matched_expense_id] = { datum: r.booking_date, transactionId: r.id };
    }
    return { uhrady };
  });
