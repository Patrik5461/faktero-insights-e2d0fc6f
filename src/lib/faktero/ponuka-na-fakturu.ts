/*
  Faktúra z cenovej ponuky — jeden tvar pre web (Konvertovať na faktúru),
  appku aj API v1.

  Doteraz mali web a API každý vlastnú kópiu a obe vynechávali to, čo
  faktúra potrebuje navyše oproti ponuke: dátum dodania (PDF ukazovalo
  „Dátum dodania —“), povinný text nad položkami, číselný rad, z ktorého
  číslo prišlo, a dátumy rátali v UTC. API navyše zahadzovalo zľavy —
  hlavička mala sumy po zľave, položky bez percenta zľavy a faktúra
  nesedela s ponukou.
*/
import { UVOD_FAKTURY, jazykDokladu } from "./faktura-jazyk";
import { vsZCislaDokladu } from "./variabilny-symbol";

type Ponuka = Record<string, any>;

export type CisloFaktury = {
  invoice_number: string;
  sequence_number: number | null;
  series_id?: string | null;
};

/** Dátum + n dní (YYYY-MM-DD), bez časového pásma. */
export function plusDni(den: string, dni: number): string {
  return new Date(new Date(`${den}T00:00:00Z`).getTime() + dni * 86400000)
    .toISOString()
    .slice(0, 10);
}

/** Hlavička faktúry z ponuky. `dnes` je dnešok podľa Bratislavy. */
export function hlavickaZPonuky(
  q: Ponuka,
  cislo: CisloFaktury,
  dnes: string,
  jazyk: string,
  splatnostDni = 14,
): Record<string, any> {
  const j = jazykDokladu(jazyk);
  return {
    company_id: q.company_id,
    customer_id: q.customer_id ?? null,
    invoice_number: cislo.invoice_number,
    sequence_number: cislo.sequence_number,
    number_series_id: cislo.series_id ?? null,
    variable_symbol: vsZCislaDokladu(cislo.invoice_number) || null,
    issue_date: dnes,
    delivery_date: dnes,
    due_date: plusDni(dnes, splatnostDni),
    currency: q.currency,
    payment_method: "bank_transfer",
    language: j,
    // Text nad položkami je na faktúre povinný; ponuka ho nemá.
    intro_note: q.quote_number
      ? `${UVOD_FAKTURY[j]} ${TEXT_PONUKY[j]} ${q.quote_number}`
      : UVOD_FAKTURY[j],
    customer_name: q.customer_name,
    customer_ico: q.customer_ico,
    customer_dic: q.customer_dic,
    customer_ic_dph: q.customer_ic_dph,
    customer_street: q.customer_street,
    customer_city: q.customer_city,
    customer_zip: q.customer_zip,
    customer_country: q.customer_country ?? "SK",
    customer_email: q.customer_email,
    subtotal: q.subtotal,
    vat_total: q.vat_total,
    total: q.total,
    // Zľavy idú s ponukou na faktúru — dohodnutá cena je to, čo zákazník
    // odsúhlasil; bez nich by faktúra pýtala viac než ponuka.
    discount_type: q.discount_type ?? null,
    discount_value: q.discount_value ?? 0,
    discount_total: q.discount_total ?? 0,
    notes: q.notes ?? null,
    // Zákazka prechádza z ponuky na faktúru.
    job_id: q.job_id ?? null,
    status: "issued",
  };
}

const TEXT_PONUKY: Record<string, string> = {
  sk: "podľa cenovej ponuky č.",
  cs: "dle cenové nabídky č.",
  en: "according to quote no.",
  de: "gemäß Angebot Nr.",
  hu: "– árajánlat száma:",
};

/** Položky faktúry z položiek ponuky. */
export function polozkyZPonuky(invoiceId: string, items: Ponuka[]): Record<string, any>[] {
  return items.map((it) => ({
    invoice_id: invoiceId,
    position: it.position,
    name: it.name,
    description: it.description,
    quantity: it.quantity,
    unit: it.unit,
    unit_price: it.unit_price,
    discount_percent: it.discount_percent ?? 0,
    vat_rate: it.vat_rate,
    subtotal: it.subtotal,
    vat_amount: it.vat_amount,
    total: it.total,
    product_id: it.product_id ?? null,
    colny_kod: it.colny_kod ?? null,
    krajina_povodu: it.krajina_povodu ?? null,
    hmotnost_kg: it.hmotnost_kg ?? null,
    prenesenie: Boolean(it.prenesenie),
  }));
}
