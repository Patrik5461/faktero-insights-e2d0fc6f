import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type NextInvoiceNumber = { invoice_number: string; sequence_number: number };

/**
 * Generates the next invoice number for a company.
 *
 * The sequence is kept in invoices.sequence_number (integer) — the previous
 * invoice_number string is NEVER parsed as an integer (that caused the year
 * prefix to be chained: 202620260002, ...).
 *
 * Supported format tokens: {YYYY} {YY} {MM} {NN} {NNN} {NNNN}
 * Sequence resets monthly when the format contains {MM}, otherwise yearly.
 * Runs inside a DB transaction with SELECT ... FOR UPDATE on companies, so two
 * concurrent invoices can never get the same number.
 */
/**
 * Argumenty berie ako pole zámerne.
 *
 * Pri pomenovaných parametroch zostavovač usúdil, že tretí nikto neposiela —
 * modul sa načítava cez `await import(...)`, takže volania nevidel — a
 * `typ ?? "regular"` zliepol na konštantu „regular". Zálohová faktúra
 * vytvorená cez API tak dostala číslo z bežnej rady namiesto „ZF…" a rovnako
 * by dopadol aj doklad k prijatej platbe. Rozbalenie z poľa sa takto
 * vyhodnotiť nedá.
 */
export async function nextInvoiceNumberDetailed(
  ...argumenty: [company_id: string, issue_date?: string | null, typDokladu?: string | null]
): Promise<NextInvoiceNumber> {
  const [company_id, issue_date, typDokladu] = argumenty;
  /*
    Parametre sa skladajú po jednom, nie podmieneným rozbalením objektu.
    S `...(type ? { _type: type } : {})` a pretypovaním na `never` zostavovač
    tú vetvu vyhodnotil ako prázdnu už pri builde — do databázy odišlo len
    `_company_id` a `_issue_date`, takže zálohová faktúra vytvorená cez API
    dostala číslo z bežnej rady namiesto „ZF…".
  */
  const { data, error } = await supabaseAdmin.rpc("faktero_next_invoice_number", {
    _company_id: company_id,
    _issue_date: issue_date ?? undefined,
    // Bežná faktúra je bez predpony; `proforma` dostane „ZF…", doklad k
    // prijatej platbe „DDP…".
    _type: typDokladu ?? "regular",
  });
  if (error) throw new Error(error.message);
  const row = data as unknown as NextInvoiceNumber | null;
  if (!row?.invoice_number) throw new Error("Nepodarilo sa vygenerovať číslo faktúry.");
  return { invoice_number: row.invoice_number, sequence_number: Number(row.sequence_number) };
}

export async function nextInvoiceNumber(
  company_id: string,
  issue_date?: string | null,
  type?: string | null,
): Promise<string> {
  return (await nextInvoiceNumberDetailed(company_id, issue_date, type)).invoice_number;
}

export function computeInvoiceTotals(
  items: { quantity: number; unit_price: number; vat_rate: number }[],
) {
  let subtotal = 0,
    vat_total = 0;
  const enriched = items.map((it) => {
    const line = +(it.quantity * it.unit_price).toFixed(2);
    const vat = +((line * it.vat_rate) / 100).toFixed(2);
    subtotal += line;
    vat_total += vat;
    return { subtotal: line, vat_amount: vat, total: +(line + vat).toFixed(2) };
  });
  return {
    subtotal: +subtotal.toFixed(2),
    vat_total: +vat_total.toFixed(2),
    total: +(subtotal + vat_total).toFixed(2),
    enriched,
  };
}
