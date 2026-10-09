/*
  Vystavenie faktúry z dát externého systému — verejné API (WooCommerce
  doplnok) aj napojenie na Shoptet. Jedna cesta, aby sa číslovanie, sadzby,
  presné sumy z obchodu a odberateľ správali všade rovnako.
*/
import { normalizePaymentMethod } from "./payment-method";

type Klient = any;

export type PolozkaFaktury = {
  name: string;
  description?: string | null;
  quantity: number;
  unit?: string;
  unit_price: number;
  vat_rate?: number;
  subtotal?: number;
  vat_amount?: number;
};

export type VstupFaktury = {
  customer_id?: string | null;
  customer?: {
    name: string;
    ico?: string | null;
    dic?: string | null;
    ic_dph?: string | null;
    street?: string | null;
    city?: string | null;
    zip?: string | null;
    country?: string | null;
    email?: string | null;
  };
  external_id?: string | null;
  issue_date?: string;
  delivery_date?: string | null;
  due_date?: string;
  variable_symbol?: string | null;
  order_number?: string | null;
  currency?: string;
  payment_method?: string;
  notes?: string | null;
  job_id?: string | null;
  items: PolozkaFaktury[];
};

export type VysledokFaktury =
  | { ok: true; faktura: any; nova: boolean }
  | { ok: false; kod: string; sprava: string; status: number };

export async function vytvorFakturu(
  supabase: Klient,
  companyId: string,
  d: VstupFaktury,
): Promise<VysledokFaktury> {
  const { nextInvoiceNumberDetailed, computeInvoiceTotals } =
    await import("./invoice-numbering.server");
  // Rovnaký externý identifikátor = tá istá objednávka; druhá faktúra nevznikne.
  if (d.external_id) {
    const { data: dupe } = await supabase
      .from("invoices")
      .select("*")
      .eq("company_id", companyId)
      .eq("external_id", d.external_id)
      .maybeSingle();
    if (dupe) return { ok: true, faktura: dupe, nova: false };
  }

  let cust: any = null;
  if (d.customer_id) {
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("id", d.customer_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!data) return { ok: false, kod: "not_found", sprava: "Odberateľ nenájdený.", status: 404 };
    cust = data;
  } else if (d.customer) {
    cust = d.customer;
  } else {
    return {
      ok: false,
      kod: "validation_error",
      sprava: "Vyžaduje sa customer_id alebo customer.",
      status: 400,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const issue_date = d.issue_date ?? today;
  let predvolenaSadzba = 23;
  if (d.items.some((i) => i.vat_rate === undefined)) {
    const { krajinaDane, zakladnaSadzba } = await import("./vat-rates");
    const { data: firma } = await supabase
      .from("companies")
      .select("vat_payer, country")
      .eq("id", companyId)
      .maybeSingle();
    predvolenaSadzba =
      firma?.vat_payer === false ? 0 : zakladnaSadzba(krajinaDane(firma?.country), issue_date);
  }
  const polozky = d.items.map((i) => ({ ...i, vat_rate: i.vat_rate ?? predvolenaSadzba }));
  const { sumyRiadkov } = await import("./api-sumy-riadkov");
  const presne = sumyRiadkov(polozky);
  if ("chyba" in presne)
    return { ok: false, kod: "validation_error", sprava: presne.chyba, status: 400 };
  const totals =
    presne.sumy ??
    computeInvoiceTotals(
      polozky.map((i) => ({
        quantity: i.quantity,
        unit_price: i.unit_price,
        vat_rate: i.vat_rate,
      })),
    );
  const { invoice_number, sequence_number } = await nextInvoiceNumberDetailed(
    companyId,
    issue_date,
  );
  const due_date = d.due_date ?? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const variable_symbol = d.variable_symbol ?? invoice_number.replace(/\D/g, "");

  const { data: created, error: insErr } = await supabase
    .from("invoices")
    .insert({
      company_id: companyId,
      customer_id: d.customer_id ?? null,
      invoice_number,
      sequence_number,
      variable_symbol,
      issue_date,
      delivery_date: d.delivery_date ?? null,
      due_date,
      currency: d.currency ?? "EUR",
      payment_method: normalizePaymentMethod(d.payment_method),
      customer_name: cust.name,
      customer_ico: cust.ico ?? null,
      customer_dic: cust.dic ?? null,
      customer_ic_dph: cust.ic_dph ?? null,
      customer_street: cust.street ?? null,
      customer_city: cust.city ?? null,
      customer_zip: cust.zip ?? null,
      customer_country: cust.country ?? "SK",
      customer_email: cust.email ?? null,
      subtotal: totals.subtotal,
      vat_total: totals.vat_total,
      total: totals.total,
      notes: d.notes ?? null,
      order_number: d.order_number ?? null,
      external_id: d.external_id ?? null,
      job_id: d.job_id ?? null,
      status: "issued",
    })
    .select()
    .single();
  if (insErr || !created)
    return {
      ok: false,
      kod: "db_error",
      sprava: insErr?.message ?? "Vloženie zlyhalo.",
      status: 500,
    };

  const itemRows = polozky.map((it, i) => ({
    invoice_id: created.id,
    position: i,
    name: it.name,
    description: it.description ?? null,
    quantity: it.quantity,
    unit: it.unit ?? "ks",
    unit_price: it.unit_price,
    vat_rate: it.vat_rate,
    subtotal: totals.enriched[i].subtotal,
    vat_amount: totals.enriched[i].vat_amount,
    total: totals.enriched[i].total,
  }));
  const { error: itErr } = await supabase.from("invoice_items").insert(itemRows);
  if (itErr) return { ok: false, kod: "db_error", sprava: itErr.message, status: 500 };
  return { ok: true, faktura: created, nova: true };
}
