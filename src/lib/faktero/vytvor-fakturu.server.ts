/*
  Vystavenie faktúry z dát externého systému — verejné API (WooCommerce
  doplnok) aj napojenie na Shoptet. Jedna cesta, aby sa číslovanie, sadzby,
  presné sumy z obchodu a odberateľ správali všade rovnako.
*/
import { normalizePaymentMethod } from "./payment-method";
import { vsNaUlozenie } from "@/lib/faktero/variabilny-symbol";

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
  /** Zľava riadku v % (jednotková cena ostáva pôvodná). */
  discount_percent?: number;
  /** Prenesenie daňovej povinnosti len pri tejto položke. */
  prenesenie?: boolean;
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
  /**
   * Prenesenie daňovej povinnosti na celej faktúre — DPH je nula. Bez režimu
   * ho určí odberateľ (`rezimNovejFaktury`), ak žiadna položka nemá DPH.
   */
  reverse_charge?: boolean;
  reverse_charge_type?: "domestic_69" | "eu_b2b" | "export" | null;
  /** Dodanie do EÚ: tovar, služba alebo trojstranný obchod; pri vývoze tovar alebo služba. */
  eu_plnenie?: "tovar" | "sluzba" | "trojstranny" | null;
  /** Zľava na celý doklad: percento alebo suma bez DPH. */
  discount_type?: "percent" | "amount" | null;
  discount_value?: number;
  items: PolozkaFaktury[];
  /**
   * Ďalšie stĺpce faktúry z verejného API (dodaci_list, zobrazit_peciatku,
   * účtovné kódy, stav, štítky, komentár, int_poznamka) — overené volajúcim.
   */
  doplnky?: Record<string, unknown>;
};

export type VysledokFaktury =
  | { ok: true; faktura: any; nova: boolean }
  | { ok: false; kod: string; sprava: string; status: number };

/** Mena faktúry, keď ju volajúci neposlal — predvolená mena firmy (CZ firma koruny). */
async function predvolenaMena(supabase: Klient, companyId: string): Promise<string> {
  const { data } = await supabase
    .from("companies")
    .select("default_currency, country")
    .eq("id", companyId)
    .maybeSingle();
  const { domacaMena } = await import("./kurzy");
  return String(data?.default_currency || domacaMena(data?.country));
}

export async function vytvorFakturu(
  supabase: Klient,
  companyId: string,
  d: VstupFaktury,
): Promise<VysledokFaktury> {
  const { nextInvoiceNumberDetailed } = await import("./invoice-numbering.server");
  // Rovnaký externý identifikátor = tá istá objednávka; druhá faktúra nevznikne.
  if (d.external_id) {
    const { data: dupe } = await supabase
      // aj-zmazane: idempotencia podľa external_id — opakovaná požiadavka nesmie založiť druhú faktúru
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
  const { krajinaDane, zakladnaSadzba } = await import("./vat-rates");
  const { data: firma } = await supabase
    .from("companies")
    .select("vat_payer, country")
    .eq("id", companyId)
    .maybeSingle();
  const predvolenaSadzba =
    firma?.vat_payer === false ? 0 : zakladnaSadzba(krajinaDane(firma?.country), issue_date);
  const polozky = d.items.map((i) => ({ ...i, vat_rate: i.vat_rate ?? predvolenaSadzba }));
  /*
    Výslovný režim platí. Bez neho rozhodne odberateľ (IČ DPH iného štátu EÚ →
    dodanie do EÚ, mimo EÚ → vývoz) — len ak žiadna položka nenesie DPH, inak
    by faktúra nesedela s tým, čo e-shop zákazníkovi naúčtoval.
  */
  const { rezimNovejFaktury } = await import("./rezim-odberatela");
  const rezim = rezimNovejFaktury({
    vstup: d,
    krajinaFirmy: krajinaDane(firma?.country),
    platitel: firma?.vat_payer !== false,
    odberatel: cust,
  });
  if ("chyba" in rezim)
    return { ok: false, kod: "validation_error", sprava: rezim.chyba, status: 400 };
  const pdp = rezim.reverse_charge;
  const typPdp = rezim.reverse_charge_type;
  // Rovnaké pravidlo ako formulár webu: dodanie do EÚ bez DPH len na IČ DPH z iného štátu.
  if (typPdp === "eu_b2b") {
    const icDph = String(cust.ic_dph ?? "").trim();
    if (!/^[A-Z]{2}[A-Z0-9]{2,}$/i.test(icDph) || /^SK/i.test(icDph))
      return {
        ok: false,
        kod: "validation_error",
        sprava: "Pri dodaní do EÚ (eu_b2b) musí mať odberateľ IČ DPH z iného členského štátu.",
        status: 400,
      };
  }
  // Zľavy a prenesenie počíta rovnako ako web (`sumyFakturyApi`).
  const { sumyFakturyApi } = await import("./api-sumy-riadkov");
  const vypocet = sumyFakturyApi(polozky, {
    reverse_charge: pdp,
    discount_type: d.discount_type ?? null,
    discount_value: d.discount_value ?? 0,
  });
  if ("chyba" in vypocet)
    return { ok: false, kod: "validation_error", sprava: vypocet.chyba, status: 400 };
  const totals = vypocet.sumy;
  const { invoice_number, sequence_number } = await nextInvoiceNumberDetailed(
    companyId,
    issue_date,
  );
  const due_date = d.due_date ?? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const variable_symbol = vsNaUlozenie(d.variable_symbol, invoice_number);
  const currency = d.currency ?? (await predvolenaMena(supabase, companyId));
  /*
    Cudzia mena: kurz ECB (CZ firma ČNB) a sumy v domácej mene hneď do riadku,
    ako pri vystavení na webe — bez nich by DPH v eurách chýbala vo výkazoch
    aj v exportoch do účtovníctva.
  */
  const { doplnovacKurzov } = await import("./kurz-dokladu.server");
  const kurz = await doplnovacKurzov(companyId)("invoices", {
    currency,
    issue_date,
    delivery_date: d.delivery_date ?? null,
    subtotal: totals.subtotal,
    vat_total: totals.vat_total,
    total: totals.total,
  });

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
      currency,
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
      discount_type: totals.discount_type,
      discount_value: totals.discount_value,
      discount_total: totals.discount_total,
      reverse_charge: pdp,
      reverse_charge_type: typPdp,
      eu_plnenie: rezim.eu_plnenie,
      notes: d.notes ?? null,
      order_number: d.order_number ?? null,
      external_id: d.external_id ?? null,
      job_id: d.job_id ?? null,
      ...(d.doplnky ?? {}),
      ...kurz,
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
    ...totals.riadky[i],
  }));
  const { error: itErr } = await supabase.from("invoice_items").insert(itemRows);
  if (itErr) return { ok: false, kod: "db_error", sprava: itErr.message, status: 500 };
  return { ok: true, faktura: created, nova: true };
}
