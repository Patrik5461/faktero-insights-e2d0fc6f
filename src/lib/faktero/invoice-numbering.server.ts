import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function nextInvoiceNumber(company_id: string): Promise<string> {
  const { data: company } = await supabaseAdmin.from("companies").select("invoice_number_format").eq("id", company_id).single();
  const format = company?.invoice_number_format || "{YYYY}{NNNN}";
  const year = new Date().getFullYear();

  const { data: rows } = await supabaseAdmin
    .from("invoices").select("invoice_number")
    .eq("company_id", company_id).like("invoice_number", `${year}%`)
    .order("invoice_number", { ascending: false }).limit(1);

  let next = 1;
  if (rows && rows[0]) {
    const m = String(rows[0].invoice_number).match(/(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return format
    .replace("{YYYY}", String(year))
    .replace("{YY}", String(year).slice(-2))
    .replace(/\{N+\}/, (m) => String(next).padStart(m.length - 2, "0"));
}

export function computeInvoiceTotals(items: { quantity: number; unit_price: number; vat_rate: number }[]) {
  let subtotal = 0, vat_total = 0;
  const enriched = items.map((it) => {
    const line = +(it.quantity * it.unit_price).toFixed(2);
    const vat = +((line * it.vat_rate) / 100).toFixed(2);
    subtotal += line; vat_total += vat;
    return { subtotal: line, vat_amount: vat, total: +(line + vat).toFixed(2) };
  });
  return { subtotal: +subtotal.toFixed(2), vat_total: +vat_total.toFixed(2), total: +(subtotal + vat_total).toFixed(2), enriched };
}