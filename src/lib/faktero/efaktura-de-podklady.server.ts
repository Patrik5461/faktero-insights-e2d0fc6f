/**
 * Údaje faktúry pre nemeckú e-faktúru (XRechnung, ZUGFeRD) — jedno miesto,
 * odkiaľ ich berie stiahnutie XRechnung aj vloženie XML do PDF.
 *
 * Klient je ten, ktorý volajúci má: pri stiahnutí prihlásený človek (rozhoduje
 * RLS), pri generovaní PDF servisný klient s faktúrou už overenou vyššie.
 */
import type { PodkladyFaktury } from "./xrechnung.server";

type Klient = any;

export async function nacitajPodkladyFaktury(
  supabase: Klient,
  companyId: string,
  invoiceId: string,
  uzNacitane?: { invoice?: any; items?: any[]; company?: any },
): Promise<PodkladyFaktury> {
  const [inv, pol, fir, prof] = await Promise.all([
    uzNacitane?.invoice
      ? { data: uzNacitane.invoice }
      : supabase
          .from("invoices")
          .select("*")
          .eq("id", invoiceId)
          .eq("company_id", companyId)
          .maybeSingle(),
    uzNacitane?.items
      ? { data: uzNacitane.items }
      : supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("position"),
    uzNacitane?.company
      ? { data: uzNacitane.company }
      : supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
    supabase.from("efaktura_profiles").select("*").eq("company_id", companyId).maybeSingle(),
  ]);
  const invoice = inv.data;
  const company = fir.data;
  if (!invoice) throw new Error("Faktúra sa nenašla.");
  if (!company) throw new Error("Firma sa nenašla.");

  // Karta odberateľa kvôli Leitweg-ID a Peppol adrese; zmazaná karta nevadí.
  let customer: any = null;
  if (invoice.customer_id) {
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("id", invoice.customer_id)
      .maybeSingle();
    customer = data ?? null;
  }

  // Dobropis a opravná faktúra nesú číslo a dátum pôvodnej (BT-25, BT-26).
  let povodnaFaktura: PodkladyFaktury["povodnaFaktura"] = null;
  if (invoice.opravuje_fakturu_id) {
    const { data: p } = await supabase
      .from("invoices")
      .select("invoice_number, issue_date")
      .eq("id", invoice.opravuje_fakturu_id)
      .maybeSingle();
    if (p) povodnaFaktura = { cislo: p.invoice_number, vystavena: p.issue_date };
  }

  const { nacitajOdpocty } = await import("./zalohy-odpocty.server");
  const zalohy = (await nacitajOdpocty(supabase, companyId, [invoiceId]))[invoiceId] ?? null;

  return {
    company,
    profile: prof?.data ?? null,
    invoice,
    items: pol.data ?? [],
    customer,
    povodnaFaktura,
    zalohy,
  };
}
