/*
  Načítanie odpočtov záloh k vyúčtovacím faktúram pre exporty. Číta sa cez
  klienta volajúceho (RLS), firmou sa filtruje aj tak.
*/

import { riadkySoZlavou } from "./zlavy";
import { riadkyOdpoctu, type OdpocetZalohy, type RiadokOdpoctu } from "./zalohy-odpocty";

type Klient = any;

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Riadky dokladu k platbe po sadzbách (kladné sumy, zľava na doklad rozpočítaná). */
function riadkyDokladu(doklad: any): RiadokOdpoctu[] {
  const po = new Map<number, RiadokOdpoctu>();
  for (const it of riadkySoZlavou<any>(doklad.invoice_items ?? [], doklad.discount_total)) {
    const sadzba = Number(it.vat_rate ?? 0) || 0;
    const x = po.get(sadzba) ?? { sadzba, zaklad: 0, dph: 0 };
    x.zaklad = r2(x.zaklad + Math.abs(Number(it.subtotal ?? 0)));
    x.dph = r2(x.dph + Math.abs(Number(it.vat_amount ?? 0)));
    po.set(sadzba, x);
  }
  return [...po.values()].filter((r) => r.zaklad || r.dph).sort((a, b) => b.sadzba - a.sadzba);
}

/**
 * Odpočty záloh pre faktúry podľa id. Faktúra bez riadkov v `invoice_advances`
 * v mape nie je (starý stĺpec `advance_amount` bez väzby sa zapísať nedá).
 */
export async function nacitajOdpocty(
  supabase: Klient,
  companyId: string,
  invoiceIds: string[],
): Promise<Record<string, OdpocetZalohy[]>> {
  if (!invoiceIds.length) return {};
  const { data: vazby } = await supabase
    .from("invoice_advances")
    .select("invoice_id, advance_invoice_id, amount")
    .eq("company_id", companyId)
    .in("invoice_id", invoiceIds);
  if (!vazby?.length) return {};
  const zalohoveIds = [...new Set(vazby.map((v: any) => String(v.advance_invoice_id)))];
  const [{ data: zalohove }, { data: kPlatbe }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, variable_symbol")
      .eq("company_id", companyId)
      .in("id", zalohoveIds),
    supabase
      .from("invoices")
      .select("id, invoice_number, advance_invoice_id, discount_total, status, invoice_items(vat_rate, subtotal, vat_amount, total, unit_price)")
      .eq("company_id", companyId)
      .eq("type", "advance_payment")
      .is("deleted_at", null)
      .in("advance_invoice_id", zalohoveIds),
  ]);
  const zf = new Map<string, any>((zalohove ?? []).map((z: any) => [String(z.id), z]));
  const ddp = new Map<string, any>();
  for (const d of kPlatbe ?? []) {
    if (d.status === "draft" || d.status === "cancelled") continue;
    ddp.set(String(d.advance_invoice_id), d);
  }

  const out: Record<string, OdpocetZalohy[]> = {};
  for (const v of vazby) {
    const z = zf.get(String(v.advance_invoice_id));
    const d = ddp.get(String(v.advance_invoice_id));
    const suma = r2(Math.abs(Number(v.amount ?? 0)));
    const zoz = out[String(v.invoice_id)] ?? [];
    zoz.push({
      zaloha: String(z?.invoice_number ?? ""),
      doklad: d ? String(d.invoice_number) : null,
      vs: z?.variable_symbol ? String(z.variable_symbol) : null,
      suma,
      riadky: d ? riadkyOdpoctu(suma, riadkyDokladu(d)) : [],
    });
    out[String(v.invoice_id)] = zoz;
  }
  return out;
}
