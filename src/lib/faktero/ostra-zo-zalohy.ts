/*
  Ostrá (vyúčtovacia) faktúra zo zálohy — z detailu zálohovej faktúry alebo
  daňového dokladu k prijatej platbe (`/faktury/nova?zo_zalohy=<id>`).

  Formulár sa predvyplní hlavičkou a položkami ZÁLOHOVEJ faktúry (doklad k
  platbe nesie len rozpočítanú prijatú sumu, nie skutočné plnenie) a pridá sa
  odpočet zálohy rovnako ako cez „Pridať uhradenú zálohu“ — riadok v
  `invoice_advances` so sumou. Rozdelenie odpočtu na základ a DPH podľa
  daňového dokladu k platbe robí až `nacitajOdpocty` (PDF, exporty,
  eFaktúra), tu sa nič nové nepočíta.

  Záloha, ktorú už iná faktúra odpočítala celú, sa druhýkrát neodpočíta —
  formulár len upozorní, kde je vyúčtovaná. Pri čiastočnom odpočte sa
  ponúkne zvyšok, ako to robí upozornenie na nezúčtované zálohy.
*/

import { colneUdajePolozkyZDokladu } from "./doklad-k-platbe";

type Klient = any;

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Faktúra, ktorá zálohu (aj čiastočne) odpočítala. */
export type VyuctovanieZalohy = {
  id: string;
  invoice_number: string;
  status: string;
  issue_date: string | null;
  /** Odpočítaná suma zálohy. */
  suma: number;
};

export type PodkladyOstrej = {
  /** Zálohová faktúra (type proforma) s hlavičkou. */
  zaloha: any;
  /** Položky zálohovej faktúry v poradí. */
  polozky: any[];
  /** Daňový doklad k prijatej platbe, ak je vystavený. */
  doklad: any | null;
  /** Faktúry, ktoré už zálohu odpočítali (bez vymazaných a stornovaných). */
  vyuctovane: VyuctovanieZalohy[];
};

export type PolozkaOstrej = {
  name: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  discount_percent: number;
  product_id: string | null;
  stock_item_id: string | null;
  colny_kod: string | null;
  krajina_povodu: string | null;
  hmotnost_kg: number | null;
  prenesenie: boolean;
  /** Ceny a sadzby zo zálohy cenník ani režim krajiny neprepisuje. */
  _cena_rucne: true;
  _dph_rucne: true;
};

export type OdpocetOstrej = { id: string; cislo: string; suma: number; mena: string | null };

export type UpozornenieOstrej =
  | { druh: "vyuctovana"; zaloha: string; faktury: VyuctovanieZalohy[] }
  | { druh: "ciastocne"; zaloha: string; faktury: VyuctovanieZalohy[]; zvysok: number }
  | { druh: "neuhradena"; zaloha: string }
  | { druh: "ciastocne_uhradena"; zaloha: string; prijate: number };

export type PredvyplnenieOstrej = {
  hlavicka: {
    customer_id: string;
    currency: string;
    language: string | null;
    payment_method: string | null;
    payment_account_id: string;
    intro_note: string | null;
    order_number: string;
    job_id: string;
    rounding_mode: string | null;
    reverse_charge: boolean;
    reverse_charge_type: string;
    eu_plnenie: string | null;
    oss: boolean;
    oss_country: string;
    osobitna_uprava: string;
    pdp_druh: string;
    discount_type: string;
    discount_value: number;
    clenenie: string;
    kv: string;
  };
  polozky: PolozkaOstrej[];
  /** Odpočet zálohy; `null` = nepridáva sa (už vyúčtovaná alebo neuhradená). */
  odpocet: OdpocetOstrej | null;
  upozornenie: UpozornenieOstrej | null;
};

const text = (v: unknown) => (v == null ? "" : String(v).trim());

/** Položky zálohovej faktúry pre formulár ostrej faktúry (kladne, s colnými údajmi). */
export function polozkyOstrejZoZalohy(polozky: any[]): PolozkaOstrej[] {
  return (polozky ?? [])
    .filter((p) => text(p?.name) || Number(p?.unit_price ?? 0) !== 0)
    .map((p) => ({
      name: text(p.name),
      description: text(p.description),
      quantity: Number(p.quantity ?? 1) || 0,
      unit: text(p.unit) || "ks",
      unit_price: Number(p.unit_price ?? 0) || 0,
      vat_rate: Number(p.vat_rate ?? 0) || 0,
      discount_percent: Number(p.discount_percent ?? 0) || 0,
      product_id: p.product_id ?? null,
      stock_item_id: p.stock_item_id ?? null,
      ...colneUdajePolozkyZDokladu(p),
      _cena_rucne: true as const,
      _dph_rucne: true as const,
    }));
}

/**
 * Čo z podkladov ide do formulára. Suma odpočtu je tá, ktorú by dal
 * „Pridať uhradenú zálohu“ (celá uhradená záloha), znížená o to, čo už
 * odpočítali iné faktúry. Pri čiastočne uhradenej zálohe s daňovým dokladom
 * sa odpočíta prijatá suma (suma dokladu k platbe).
 */
export function predvyplnenieOstrejZoZalohy(p: PodkladyOstrej): PredvyplnenieOstrej {
  const z = p.zaloha ?? {};
  const cislo = String(z.invoice_number ?? "");
  const hlavicka: PredvyplnenieOstrej["hlavicka"] = {
    customer_id: text(z.customer_id),
    currency: text(z.currency) || "EUR",
    language: text(z.language) || null,
    payment_method: text(z.payment_method) || null,
    payment_account_id: text(z.payment_account_id),
    intro_note: text(z.intro_note) || null,
    order_number: text(z.order_number),
    job_id: text(z.job_id),
    rounding_mode: text(z.rounding_mode) || null,
    reverse_charge: Boolean(z.reverse_charge),
    reverse_charge_type: text(z.reverse_charge_type),
    eu_plnenie: text(z.eu_plnenie) || null,
    oss: Boolean(z.oss),
    oss_country: text(z.oss_country),
    osobitna_uprava: text(z.osobitna_uprava),
    pdp_druh: text(z.pdp_druh),
    discount_type: text(z.discount_type),
    discount_value: Number(z.discount_value ?? 0) || 0,
    clenenie: text(z.pohoda_clenenie_dph),
    kv: text(z.kv_clenenie),
  };
  const polozky = polozkyOstrejZoZalohy(p.polozky);

  const uzOdpocitane = r2((p.vyuctovane ?? []).reduce((s, v) => s + Math.abs(Number(v.suma ?? 0)), 0));
  const uhradena = z.status === "paid";
  const doklad = p.doklad && p.doklad.status !== "draft" && p.doklad.status !== "cancelled" ? p.doklad : null;
  // Uhradená záloha sa odpočíta celá; čiastočne uhradená len sumou dokladu k platbe.
  const zaklad = uhradena
    ? r2(Math.abs(Number(z.total ?? 0)))
    : doklad
      ? r2(Math.min(Math.abs(Number(doklad.total ?? 0)), Math.abs(Number(z.total ?? 0))))
      : 0;

  if (!uhradena && !doklad)
    return { hlavicka, polozky, odpocet: null, upozornenie: { druh: "neuhradena", zaloha: cislo } };

  const zvysok = r2(zaklad - uzOdpocitane);
  if (zvysok <= 0.004)
    return {
      hlavicka,
      polozky,
      odpocet: null,
      upozornenie: { druh: "vyuctovana", zaloha: cislo, faktury: p.vyuctovane },
    };

  const odpocet: OdpocetOstrej = { id: String(z.id), cislo, suma: zvysok, mena: text(z.currency) || null };
  const upozornenie: UpozornenieOstrej | null =
    uzOdpocitane > 0.004
      ? { druh: "ciastocne", zaloha: cislo, faktury: p.vyuctovane, zvysok }
      : !uhradena
        ? { druh: "ciastocne_uhradena", zaloha: cislo, prijate: zaklad }
        : null;
  return { hlavicka, polozky, odpocet, upozornenie };
}

/**
 * Faktúry, ktoré zálohu odpočítali: riadky `invoice_advances` a staré faktúry
 * len s `advance_invoice_id` + `advance_amount`. Vymazané a stornované sa
 * nerátajú — ich odpočet neplatí. Koncept sa ráta (inak by vznikol druhý).
 */
export async function nacitajVyuctovanieZalohy(
  supabase: Klient,
  companyId: string,
  zalohaId: string,
): Promise<VyuctovanieZalohy[]> {
  const [{ data: vazby, error: e1 }, { data: stare, error: e2 }] = await Promise.all([
    supabase
      .from("invoice_advances")
      .select("invoice_id, amount")
      .eq("company_id", companyId)
      .eq("advance_invoice_id", zalohaId),
    supabase
      .from("invoices")
      .select("id, advance_amount")
      .eq("company_id", companyId)
      .eq("type", "regular")
      .eq("advance_invoice_id", zalohaId)
      .is("deleted_at", null),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const sumy = new Map<string, number>();
  for (const v of vazby ?? []) sumy.set(String(v.invoice_id), r2((sumy.get(String(v.invoice_id)) ?? 0) + Math.abs(Number(v.amount ?? 0))));
  for (const s of stare ?? []) {
    if (sumy.has(String(s.id))) continue;
    const a = Math.abs(Number(s.advance_amount ?? 0));
    if (a > 0) sumy.set(String(s.id), r2(a));
  }
  if (!sumy.size) return [];
  const { data: faktury, error: e3 } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, issue_date, deleted_at, type")
    .eq("company_id", companyId)
    .in("id", [...sumy.keys()]);
  if (e3) throw e3;
  return (faktury ?? [])
    .filter((f: any) => !f.deleted_at && f.status !== "cancelled" && f.type === "regular")
    .map((f: any) => ({
      id: String(f.id),
      invoice_number: String(f.invoice_number ?? ""),
      status: String(f.status ?? ""),
      issue_date: f.issue_date ?? null,
      suma: sumy.get(String(f.id)) ?? 0,
    }))
    .sort((a: VyuctovanieZalohy, b: VyuctovanieZalohy) => String(a.issue_date ?? "").localeCompare(String(b.issue_date ?? "")));
}

/**
 * Podklady ostrej faktúry podľa id zálohovej faktúry alebo daňového dokladu
 * k platbe. `null`, keď doklad nie je ani jedno z toho.
 */
export async function nacitajPodkladyOstrej(
  supabase: Klient,
  companyId: string,
  id: string,
): Promise<PodkladyOstrej | null> {
  const { data: prvy, error } = await supabase
    .from("invoices")
    .select("id, type, advance_invoice_id, status, total, invoice_number, deleted_at")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!prvy || prvy.deleted_at) return null;
  const zalohaId =
    prvy.type === "proforma" ? prvy.id : prvy.type === "advance_payment" ? prvy.advance_invoice_id : null;
  if (!zalohaId) return null;

  // `*` — stĺpec `pdp_druh` nemusí byť v každej DB (ako pri dobropise).
  const [{ data: zaloha, error: ez }, { data: polozky, error: ep }, { data: doklady, error: ed }, vyuctovane] =
    await Promise.all([
      supabase.from("invoices").select("*").eq("company_id", companyId).eq("id", zalohaId).maybeSingle(),
      supabase
        .from("invoice_items")
        .select(
          "name, description, quantity, unit, unit_price, vat_rate, discount_percent, product_id, stock_item_id, colny_kod, krajina_povodu, hmotnost_kg, prenesenie, position",
        )
        .eq("invoice_id", zalohaId)
        .order("position"),
      supabase
        .from("invoices")
        .select("id, invoice_number, status, total, issue_date")
        .eq("company_id", companyId)
        .eq("type", "advance_payment")
        .eq("advance_invoice_id", zalohaId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      nacitajVyuctovanieZalohy(supabase, companyId, zalohaId),
    ]);
  if (ez) throw ez;
  if (ep) throw ep;
  if (ed) throw ed;
  if (!zaloha || zaloha.deleted_at || zaloha.type !== "proforma") return null;
  const platne = (doklady ?? []).filter((d: any) => d.status !== "draft" && d.status !== "cancelled");
  return {
    zaloha,
    polozky: polozky ?? [],
    doklad: prvy.type === "advance_payment" ? (platne.find((d: any) => d.id === prvy.id) ?? platne[0] ?? null) : (platne[0] ?? null),
    vyuctovane,
  };
}

export type StavOstrej = {
  /** Zálohová faktúra (id, číslo). */
  zalohaId: string;
  zalohaCislo: string;
  /** Faktúry, ktoré zálohu odpočítali. */
  faktury: VyuctovanieZalohy[];
  /** Záloha je odpočítaná celá — ďalšia ostrá faktúra by ju odpočítala druhýkrát. */
  vyuctovana: boolean;
  /** Ostrá faktúra so odpočtom sa dá vystaviť (uhradená, nie celá odpočítaná). */
  mozeOstru: boolean;
};

/** Stav vyúčtovania zálohy pre detail — z tej istej logiky ako predvyplnenie formulára. */
export function stavOstrejZoZalohy(
  zaloha: { id: string; invoice_number?: string | null; status?: string | null; total?: unknown; deleted_at?: unknown },
  doklad: { status?: string | null; total?: unknown } | null,
  vyuctovane: VyuctovanieZalohy[],
): StavOstrej {
  const p = predvyplnenieOstrejZoZalohy({ zaloha, polozky: [], doklad, vyuctovane });
  const neplatna = zaloha.status === "cancelled" || zaloha.status === "draft" || Boolean(zaloha.deleted_at);
  return {
    zalohaId: String(zaloha.id),
    zalohaCislo: String(zaloha.invoice_number ?? ""),
    faktury: vyuctovane,
    vyuctovana: p.upozornenie?.druh === "vyuctovana",
    mozeOstru: !neplatna && p.odpocet !== null,
  };
}

/** Stav vyúčtovania pre detail zálohovej faktúry alebo daňového dokladu k platbe. */
export async function nacitajStavOstrej(
  supabase: Klient,
  companyId: string,
  inv: { id: string; type: string; advance_invoice_id?: string | null },
): Promise<StavOstrej | null> {
  const zalohaId = inv.type === "proforma" ? inv.id : inv.type === "advance_payment" ? inv.advance_invoice_id : null;
  if (!zalohaId) return null;
  const [{ data: zaloha, error: ez }, { data: doklady, error: ed }, vyuctovane] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, status, total, deleted_at, type")
      .eq("company_id", companyId)
      .eq("id", zalohaId)
      .maybeSingle(),
    supabase
      .from("invoices")
      .select("id, status, total")
      .eq("company_id", companyId)
      .eq("type", "advance_payment")
      .eq("advance_invoice_id", zalohaId)
      .is("deleted_at", null),
    nacitajVyuctovanieZalohy(supabase, companyId, zalohaId),
  ]);
  if (ez) throw ez;
  if (ed) throw ed;
  if (!zaloha || zaloha.type !== "proforma") return null;
  const platne = (doklady ?? []).filter((d: any) => d.status !== "draft" && d.status !== "cancelled");
  const doklad = platne.find((d: any) => d.id === inv.id) ?? platne[0] ?? null;
  return stavOstrejZoZalohy(zaloha, doklad, vyuctovane);
}
