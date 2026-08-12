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
export async function nextInvoiceNumberDetailed(
  company_id: string,
  issue_date?: string | null,
  /** Zálohové faktúry majú vlastnú radu (ZF…), aby v rade daňových dokladov neboli diery. */
  type?: string | null,
): Promise<NextInvoiceNumber> {
  const { data, error } = await supabaseAdmin.rpc("faktero_next_invoice_number", {
    _company_id: company_id,
    ...(issue_date ? { _issue_date: issue_date } : {}),
    ...(type ? { _type: type } : {}),
  } as never);
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
