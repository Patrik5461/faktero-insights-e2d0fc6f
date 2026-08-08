import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dalsieCisloDokladu } from "./cislovanie";

export async function nextQuoteNumber(company_id: string): Promise<string> {
  const prefix = `Q${new Date().getFullYear()}`;
  const { data: rows } = await supabaseAdmin
    .from("quotes")
    .select("quote_number")
    .eq("company_id", company_id)
    .like("quote_number", `${prefix}%`)
    .limit(5000);
  return dalsieCisloDokladu(
    prefix,
    (rows ?? []).map((r) => r.quote_number),
  );
}

export function computeQuoteTotals(
  items: { quantity: number; unit_price: number; vat_rate: number }[],
) {
  let subtotal = 0,
    vat_total = 0;
  const enriched = items.map((it) => {
    const line = +(Number(it.quantity) * Number(it.unit_price)).toFixed(2);
    const vat = +((line * Number(it.vat_rate)) / 100).toFixed(2);
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
