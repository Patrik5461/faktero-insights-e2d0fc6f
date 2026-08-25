import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dalsieCisloDokladu } from "./cislovanie";
import { nacitajPouziteCisla } from "./cislovanie-nacitanie";

export async function nextQuoteNumber(company_id: string): Promise<string> {
  const prefix = `Q${new Date().getFullYear()}`;
  const rows = await nacitajPouziteCisla(
    supabaseAdmin,
    "quotes",
    "quote_number",
    company_id,
    prefix,
  );
  return dalsieCisloDokladu(prefix, rows);
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
