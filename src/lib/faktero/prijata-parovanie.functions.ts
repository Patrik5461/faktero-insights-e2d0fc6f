import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sparujPrijate, type Pohyb, type PrijataFaktura } from "./prijata-parovanie";

/**
 * Návrhy a potvrdzovanie väzby prijatej faktúry na pohyb na účte.
 *
 * Čítanie aj zápis idú cez klienta prihláseného človeka, takže o oddelenie
 * firiem sa stará RLS — vlastné overovanie `company_id` by bola druhá, slabšia
 * poistka na tom istom mieste.
 *
 * Nič sa nepáruje samo od seba. Potvrdenie mení stav faktúry na uhradenú, a to
 * je zápis do účtovníctva — nemá vzniknúť bez toho, aby o ňom niekto vedel.
 */

/*
  Vygenerované typy zo Supabase (`integrations/supabase/types.ts`) sa naposledy
  robili v auguste a stĺpec `matched_purchase_invoice_id` v nich ešte nie je.
  Kým sa neobnovia, chodí prístup k nemu cez tento jeden typ — inak by bolo
  pretypovanie rozsypané po celom súbore.
*/
type Klient = { from: (tabulka: string) => any };

/**
 * Ako ďaleko dozadu sa hľadá.
 *
 * Pol roka, lebo faktúra po splatnosti sa platí aj o mesiace neskôr. Pri
 * bločkoch stačí šesťdesiat dní, tu by to bolo málo.
 */
const DNI_DOZADU = 190;

function predDnami(dni: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dni);
  return d.toISOString().slice(0, 10);
}

export const navrhniParovaniePrijatych = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ company_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as unknown as Klient;
    const od = predDnami(DNI_DOZADU);

    const { data: faktury } = await supabase
      .from("purchase_invoices")
      .select(
        "id, supplier_name, invoice_number, variable_symbol, issue_date, due_date, amount_total, currency, payment_method, status",
      )
      .eq("company_id", data.company_id)
      .is("deleted_at", null)
      .gte("issue_date", od)
      .neq("status", "cancelled")
      // Hotovosť sa v banke neobjaví, tak ju netreba ani ťahať.
      .or("payment_method.is.null,payment_method.neq.hotovost")
      .order("issue_date", { ascending: false })
      .limit(400);

    /*
      Pohyby sa vyberajú podľa súm faktúr, nie „posledných N odchádzajúcich".

      Účet, cez ktorý chodí prevádzka, má za pol roka aj dvetisíc odchádzajúcich
      platieb. Pri strope na počet vypadli tie staršie — teda práve tie, kvôli
      ktorým je okno také široké: faktúra zaplatená dva mesiace po vystavení.
      Suma musí sedieť na cent, takže je to zároveň ten najostrejší filter, aký
      máme, a nechá z tisícok riadkov pár.
    */
    const sumy = [
      ...new Set(
        ((faktury as unknown as PrijataFaktura[]) ?? [])
          .map((f) =>
            f.amount_total == null ? null : -Math.round(Number(f.amount_total) * 100) / 100,
          )
          .filter((x): x is number => x != null && x < 0),
      ),
    ];

    const { data: pohyby } = sumy.length
      ? await supabase
          .from("bank_transactions")
          .select("id, booking_date, amount, currency, variable_symbol, counterparty, description")
          .eq("company_id", data.company_id)
          .gte("booking_date", od)
          .in("amount", sumy)
          /*
            Pohyb, ktorý už niečo uhrádza, nemá čo uhrádzať druhýkrát — ani
            vydanú faktúru, ani doklad, ani splátku.
          */
          .is("matched_purchase_invoice_id", null)
          .is("matched_expense_id", null)
          .is("matched_invoice_id", null)
          .is("matched_installment_id", null)
          .order("booking_date", { ascending: false })
          .limit(1000)
      : { data: [] as any[] };

    // Faktúra, ktorá už pohyb má, sa znova neponúka.
    const { data: uzSparovane } = await supabase
      .from("bank_transactions")
      .select("matched_purchase_invoice_id")
      .eq("company_id", data.company_id)
      .not("matched_purchase_invoice_id", "is", null);
    const obsadene = new Set(
      ((uzSparovane as { matched_purchase_invoice_id: string }[]) ?? []).map(
        (r) => r.matched_purchase_invoice_id,
      ),
    );

    const otvorene = ((faktury as unknown as PrijataFaktura[]) ?? []).filter(
      (f) => !obsadene.has(f.id),
    );
    const zoznamPohybov = ((pohyby as unknown as Pohyb[]) ?? []).map((p) => ({
      ...p,
      amount: Number(p.amount),
    }));

    const zhody = sparujPrijate(
      zoznamPohybov,
      otvorene.map((f) => ({
        ...f,
        amount_total: f.amount_total == null ? null : Number(f.amount_total),
      })),
    );

    // Do odpovede patrí aj to, čo je v dvojici — inak by zoznam ukazoval
    // identifikátory a človek by nevedel, čo potvrdzuje.
    const fakturaPodlaId = new Map(otvorene.map((f) => [f.id, f]));
    const pohybPodlaId = new Map(zoznamPohybov.map((p) => [p.id, p]));

    return {
      zhody: zhody.map((z) => ({
        ...z,
        faktura: fakturaPodlaId.get(z.purchaseInvoiceId) ?? null,
        pohyb: pohybPodlaId.get(z.transactionId) ?? null,
      })),
    };
  });

/**
 * Zapíše väzbu a faktúru označí za uhradenú.
 *
 * Dátum úhrady je deň zaúčtovania pohybu, nie dnešok — do účtovníctva patrí
 * deň, keď peniaze odišli.
 */
export const potvrdParovaniePrijatej = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({ transaction_id: z.string().uuid(), purchase_invoice_id: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as unknown as Klient;

    const { data: pohyb } = await supabase
      .from("bank_transactions")
      .select("id, booking_date, amount")
      .eq("id", data.transaction_id)
      .maybeSingle();
    if (!pohyb) throw new Error("Pohyb sa nenašiel.");

    /*
      Podmienka `is null` je tu naschvál: keby ten istý pohyb medzitým spároval
      niekto iný (alebo druhé ťuknutie), zápis hotovú väzbu neprepíše, ale
      neurobí nič — a to sa dá povedať nahlas.
    */
    const { data: zmenene, error } = await supabase
      .from("bank_transactions")
      .update({ matched_purchase_invoice_id: data.purchase_invoice_id })
      .eq("id", data.transaction_id)
      .is("matched_purchase_invoice_id", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!zmenene?.length) throw new Error("Tento pohyb je už spárovaný s inou faktúrou.");

    const { error: chybaFaktury } = await supabase
      .from("purchase_invoices")
      .update({
        status: "paid",
        payment_date: pohyb.booking_date,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.purchase_invoice_id);
    if (chybaFaktury) {
      // Väzbu nenechávame visieť na faktúre, ktorá o nej nevie.
      await supabase
        .from("bank_transactions")
        .update({ matched_purchase_invoice_id: null })
        .eq("id", data.transaction_id);
      throw new Error(chybaFaktury.message);
    }

    return { ok: true, payment_date: pohyb.booking_date };
  });

/**
 * Zruší väzbu.
 *
 * Stav faktúry sa vracia späť len vtedy, keď ho nastavilo práve toto
 * párovanie — teda keď dátum úhrady sedí na deň zaúčtovania pohybu. Keby si
 * niekto zapísal úhradu ručne k inému dňu, zrušením väzby o ten záznam
 * neprísť nesmie.
 */
export const zrusParovaniePrijatej = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ transaction_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as unknown as Klient;

    const { data: pohyb } = await supabase
      .from("bank_transactions")
      .select("id, booking_date, matched_purchase_invoice_id")
      .eq("id", data.transaction_id)
      .maybeSingle();
    if (!pohyb?.matched_purchase_invoice_id) throw new Error("Platba nie je spárovaná.");

    const { data: faktura } = await supabase
      .from("purchase_invoices")
      .select("id, status, payment_date")
      .eq("id", pohyb.matched_purchase_invoice_id)
      .maybeSingle();

    const { error } = await supabase
      .from("bank_transactions")
      .update({ matched_purchase_invoice_id: null })
      .eq("id", data.transaction_id);
    if (error) throw new Error(error.message);

    if (faktura?.status === "paid" && faktura.payment_date === pohyb.booking_date) {
      await supabase
        .from("purchase_invoices")
        .update({ status: "booked", payment_date: null, updated_at: new Date().toISOString() })
        .eq("id", faktura.id);
    }

    return { ok: true };
  });

/**
 * Ktoré prijaté faktúry zo zoznamu sú uhradené z účtu.
 *
 * Vracia aj identifikátor pohybu, nielen dátum — bez neho by sa väzba nedala
 * zrušiť odtiaľ, kde je vidieť.
 */
export const uhradyPrijatych = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({ company_id: z.string().uuid(), ids: z.array(z.string().uuid()).max(300) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    type Uhrada = {
      datum: string;
      transactionId: string;
      suma: number;
      protistrana: string | null;
    };
    if (!data.ids.length) return { uhrady: {} as Record<string, Uhrada> };

    const supabase = context.supabase as unknown as Klient;
    const { data: rows } = await supabase
      .from("bank_transactions")
      .select("id, matched_purchase_invoice_id, booking_date, amount, counterparty")
      .eq("company_id", data.company_id)
      .in("matched_purchase_invoice_id", data.ids);

    const uhrady: Record<string, Uhrada> = {};
    for (const r of (rows as any[]) ?? []) {
      uhrady[r.matched_purchase_invoice_id] = {
        datum: r.booking_date,
        transactionId: r.id,
        suma: Number(r.amount),
        protistrana: r.counterparty ?? null,
      };
    }
    return { uhrady };
  });
