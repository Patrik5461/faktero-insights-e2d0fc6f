import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { vsetkoAkoData } from "./strankovanie";
import { DRUHY_NA_UHRADU } from "./ostatne-doklady";
import {
  jeNaUhradu,
  oknoPlatby,
  poradieNaVyber,
  sparujOstatne,
  type OstatnyNaUhradu,
  type PohybOstatneho,
} from "./ostatne-parovanie";

/**
 * Návrhy, potvrdenie a zrušenie väzby iného dokladu (predpis, výmer, pokuta…)
 * na odchádzajúci pohyb z účtu; ručné „Zaplatené bez pohybu“.
 *
 * Všetko ide cez klienta prihláseného človeka — o firmu a oblasť (Banka,
 * Ostatné doklady) sa stará RLS. Zápis väzby je úprava pohybu, takže ju
 * smie urobiť ten, kto smie upravovať Banku (ako pri prijatých faktúrach).
 *
 * Nič sa nepáruje samo od seba: aj istý návrh čaká na klik človeka.
 */

/*
  Vygenerované typy stĺpec `matched_other_document_id` poznajú, ale dotazy
  so skladaným `select` a `or` ich aj tak strácajú — jeden voľný typ klienta.
*/
type Klient = { from: (tabulka: string) => any };

/** Ako ďaleko dozadu (podľa lehoty/doručenia) sa doklady na úhradu berú. */
const DNI_DOZADU = 200;

const POLIA_DOKLADU =
  "id, kind, sender, subject, amount, currency, due_date, received_date, variable_symbol, iban, paid_at, status";
const POLIA_POHYBU =
  "id, booking_date, amount, currency, variable_symbol, counterparty, counterparty_iban, description";

/** Pohyb, ktorý už niečo uhrádza alebo je vybavený bez dokladu, sa neponúka. */
function lenVolne(q: any) {
  return q
    .is("matched_other_document_id", null)
    .is("matched_purchase_invoice_id", null)
    .is("matched_expense_id", null)
    .is("matched_invoice_id", null)
    .is("matched_installment_id", null)
    .is("vybavenie", null);
}

function predDnami(dni: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dni);
  return d.toISOString().slice(0, 10);
}

function cislaPohybu(p: any): PohybOstatneho {
  return { ...p, amount: Number(p.amount) };
}

function cislaDokladu(d: any): OstatnyNaUhradu {
  return { ...d, amount: d.amount == null ? null : Number(d.amount) };
}

/** Id dokladov, ktoré už majú pohyb (stránkovane — strop 1 000 riadkov). */
async function obsadeneDoklady(sb: Klient, companyId: string): Promise<Set<string>> {
  const { data } = await vsetkoAkoData((zac, kon) =>
    sb
      .from("bank_transactions")
      .select("matched_other_document_id")
      .eq("company_id", companyId)
      .not("matched_other_document_id", "is", null)
      .order("id")
      .range(zac, kon),
  );
  return new Set(
    ((data as { matched_other_document_id: string }[]) ?? []).map((r) => r.matched_other_document_id),
  );
}

export const navrhniParovanieOstatnych = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ company_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const sb = context.supabase as unknown as Klient;
    const od = predDnami(DNI_DOZADU);

    const { data: riadky } = await sb
      .from("other_documents")
      .select(POLIA_DOKLADU)
      .eq("company_id", data.company_id)
      .in("kind", DRUHY_NA_UHRADU as unknown as string[])
      .gt("amount", 0)
      .is("paid_at", null)
      // Odovzdaný doklad je u účtovníka uzavretý — návrh by svietil navždy.
      .neq("status", "exported")
      .or(`due_date.gte.${od},and(due_date.is.null,received_date.gte.${od})`)
      .order("received_date", { ascending: false })
      .limit(500);

    const obsadene = await obsadeneDoklady(sb, data.company_id);
    const doklady = ((riadky as any[]) ?? [])
      .map(cislaDokladu)
      .filter((d) => jeNaUhradu(d) && !obsadene.has(d.id));

    // Pohyby len na sumy dokladov — najostrejší filter (ako pri prijatých faktúrach).
    const sumy = [
      ...new Set(doklady.map((d) => -Math.round(Number(d.amount) * 100) / 100).filter((x) => x < 0)),
    ];
    const okna = doklady.map(oknoPlatby).filter((x): x is { od: string; do: string } => !!x);
    if (!sumy.length || !okna.length) return { zhody: [] };
    const najskor = okna.map((o) => o.od).sort()[0]!;

    const { data: pohybyRaw } = await lenVolne(
      sb
        .from("bank_transactions")
        .select(POLIA_POHYBU)
        .eq("company_id", data.company_id)
        .gte("booking_date", najskor)
        .in("amount", sumy),
    )
      .order("booking_date", { ascending: false })
      .limit(1000);
    const pohyby = ((pohybyRaw as any[]) ?? []).map(cislaPohybu);

    const zhody = sparujOstatne(pohyby, doklady);
    const dokladPodlaId = new Map(doklady.map((d) => [d.id, d]));
    const pohybPodlaId = new Map(pohyby.map((p) => [p.id, p]));
    return {
      zhody: zhody.map((z) => ({
        ...z,
        doklad: dokladPodlaId.get(z.otherDocumentId) ?? null,
        pohyb: pohybPodlaId.get(z.transactionId) ?? null,
      })),
    };
  });

/**
 * Zapíše väzbu pohybu na doklad. Ručné „Zaplatené bez pohybu“ sa zruší —
 * pohyb z účtu je lepší doklad o úhrade.
 */
export const potvrdParovanieOstatneho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({ transaction_id: z.string().uuid(), other_document_id: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const sb = context.supabase as unknown as Klient;

    const [{ data: pohyb }, { data: doklad }] = await Promise.all([
      sb
        .from("bank_transactions")
        .select(
          "id, company_id, amount, booking_date, matched_invoice_id, matched_purchase_invoice_id, matched_expense_id, matched_installment_id, matched_other_document_id, vybavenie",
        )
        .eq("id", data.transaction_id)
        .maybeSingle(),
      sb.from("other_documents").select("id, company_id, paid_at").eq("id", data.other_document_id).maybeSingle(),
    ]);
    if (!pohyb) throw new Error("Pohyb sa nenašiel.");
    if (!doklad) throw new Error("Doklad sa nenašiel.");
    if (pohyb.company_id !== doklad.company_id) throw new Error("Doklad nepatrí k tejto firme.");
    if (Number(pohyb.amount) >= 0) throw new Error("Iný doklad sa dá spárovať len s odchádzajúcou platbou.");
    if (
      pohyb.matched_invoice_id ||
      pohyb.matched_purchase_invoice_id ||
      pohyb.matched_expense_id ||
      pohyb.matched_installment_id ||
      pohyb.matched_other_document_id
    )
      throw new Error("Tento pohyb je už spárovaný s iným dokladom.");
    if (pohyb.vybavenie) throw new Error("Pohyb je označený bez dokladu — najprv zrušte označenie.");

    const { count } = await sb
      .from("bank_transactions")
      .select("id", { count: "exact", head: true })
      .eq("matched_other_document_id", data.other_document_id);
    if ((count ?? 0) > 0) throw new Error("Doklad už má spárovanú platbu.");

    /*
      `is null` naschvál: keby ten istý pohyb medzitým spároval niekto iný,
      zápis väzbu neprepíše a dá sa to povedať nahlas. Nula riadkov bez chyby
      znamená aj to, že RLS úpravu banky nepustila.
    */
    const { data: zmenene, error } = await sb
      .from("bank_transactions")
      .update({ matched_other_document_id: data.other_document_id })
      .eq("id", data.transaction_id)
      .is("matched_other_document_id", null)
      .select("id");
    if (error) {
      if (/duplicate|unique/i.test(error.message)) throw new Error("Doklad už má spárovanú platbu.");
      throw new Error(error.message);
    }
    if (!zmenene?.length)
      throw new Error("Pohyb sa nespároval — je už spárovaný alebo na úpravu Banky nemáte právo.");

    if (doklad.paid_at)
      await sb.from("other_documents").update({ paid_at: null }).eq("id", data.other_document_id);

    return { ok: true, datum: pohyb.booking_date as string };
  });

/** Zruší väzbu pohybu na iný doklad. */
export const zrusParovanieOstatneho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ transaction_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const sb = context.supabase as unknown as Klient;
    const { data: zmenene, error } = await sb
      .from("bank_transactions")
      .update({ matched_other_document_id: null })
      .eq("id", data.transaction_id)
      .not("matched_other_document_id", "is", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!zmenene?.length)
      throw new Error("Väzba sa nezrušila — platba nie je spárovaná alebo na úpravu Banky nemáte právo.");
    return { ok: true };
  });

/** Ktoré iné doklady zo zoznamu sú uhradené pohybom z účtu. */
export const uhradyOstatnych = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ company_id: z.string().uuid(), ids: z.array(z.string().uuid()).max(300) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    type Uhrada = {
      datum: string;
      transactionId: string;
      suma: number;
      mena: string | null;
      protistrana: string | null;
      vs: string | null;
      ucet: string | null;
    };
    if (!data.ids.length) return { uhrady: {} as Record<string, Uhrada> };
    const sb = context.supabase as unknown as Klient;
    const { data: rows } = await sb
      .from("bank_transactions")
      .select("id, matched_other_document_id, booking_date, amount, currency, counterparty, counterparty_iban, variable_symbol")
      .eq("company_id", data.company_id)
      .in("matched_other_document_id", data.ids);
    const uhrady: Record<string, Uhrada> = {};
    for (const r of (rows as any[]) ?? []) {
      uhrady[r.matched_other_document_id] = {
        datum: r.booking_date,
        transactionId: r.id,
        suma: Number(r.amount),
        mena: r.currency ?? null,
        protistrana: r.counterparty ?? null,
        vs: r.variable_symbol ?? null,
        ucet: r.counterparty_iban ?? null,
      };
    }
    return { uhrady };
  });

/** „Zaplatené bez pohybu“ (hotovosť, pošta) — alebo zrušenie (`paid_at: null`). */
export const oznacZaplatenyOstatnyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        company_id: z.string().uuid(),
        id: z.string().uuid(),
        paid_at: z.string().date().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const sb = context.supabase as unknown as Klient;
    if (data.paid_at) {
      const { count } = await sb
        .from("bank_transactions")
        .select("id", { count: "exact", head: true })
        .eq("company_id", data.company_id)
        .eq("matched_other_document_id", data.id);
      if ((count ?? 0) > 0) throw new Error("Doklad má spárovaný pohyb z účtu — najprv zrušte väzbu.");
    }
    const { data: zmenene, error } = await sb
      .from("other_documents")
      .update({ paid_at: data.paid_at })
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!zmenene?.length) throw new Error("Doklad neexistuje alebo naň nemáte právo.");
    return { ok: true };
  });

/**
 * Pohyby na ručný výber k dokladu: odchádzajúce, voľné, v okne okolo lehoty.
 * Najprv tie, ktoré by párovanie ponúklo, potom rovnaká suma, potom najbližšie.
 */
export const pohybyNaVyberOstatnehoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        company_id: z.string().uuid(),
        id: z.string().uuid(),
        hladat: z.string().trim().max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const sb = context.supabase as unknown as Klient;
    const { data: d } = await sb
      .from("other_documents")
      .select(POLIA_DOKLADU)
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!d) throw new Error("Doklad neexistuje alebo naň nemáte právo.");
    const doklad = cislaDokladu(d);
    const okno = oknoPlatby(doklad) ?? { od: predDnami(DNI_DOZADU), do: "2999-12-31" };

    let q = lenVolne(
      sb
        .from("bank_transactions")
        .select(POLIA_POHYBU)
        .eq("company_id", data.company_id)
        .lt("amount", 0)
        .gte("booking_date", okno.od)
        .lte("booking_date", okno.do),
    );
    const h = data.hladat?.replace(/[%,()*]/g, " ").trim();
    if (h) q = q.or(`counterparty.ilike.%${h}%,variable_symbol.ilike.%${h}%,description.ilike.%${h}%`);
    const { data: rows, error } = await q.order("booking_date", { ascending: false }).limit(300);
    if (error) throw new Error(error.message);
    const pohyby = ((rows as any[]) ?? [])
      .map(cislaPohybu)
      .map((p) => ({ ...p, poradie: poradieNaVyber(p, doklad) }))
      .sort((a, b) => b.poradie - a.poradie)
      .slice(0, 40);
    return { pohyby };
  });

/**
 * Iné doklady na výber k pohybu (v detaile pohybu na strane Banky): doklady
 * na úhradu bez platby; najprv tie, ktoré sedia sumou a VS/IBAN-om.
 */
export const dokladyNaVyberPohybuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ company_id: z.string().uuid(), transaction_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const sb = context.supabase as unknown as Klient;
    const { data: p } = await sb
      .from("bank_transactions")
      .select(POLIA_POHYBU)
      .eq("id", data.transaction_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!p) throw new Error("Pohyb sa nenašiel.");
    const pohyb = cislaPohybu(p);
    if (pohyb.amount >= 0) return { doklady: [] };

    const { data: rows, error } = await sb
      .from("other_documents")
      .select(POLIA_DOKLADU)
      .eq("company_id", data.company_id)
      .in("kind", DRUHY_NA_UHRADU as unknown as string[])
      // Bez sumy doklad nie je výzva na úhradu (list, výzva na výkaz) — len by zavadzal.
      .gt("amount", 0)
      .is("paid_at", null)
      .order("received_date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const obsadene = await obsadeneDoklady(sb, data.company_id);
    const doklady = ((rows as any[]) ?? [])
      .map(cislaDokladu)
      .filter((d) => !obsadene.has(d.id))
      .map((d) => ({ ...d, poradie: poradieNaVyber(pohyb, d) }))
      .sort((a, b) => b.poradie - a.poradie)
      .slice(0, 40);
    return { doklady };
  });
