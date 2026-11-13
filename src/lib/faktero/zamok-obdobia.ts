/*
  Uzamknuté obdobie (`companies.locked_until`) — zoznamy chránených polí a
  pravidlo spúšťača `guard_locked_period_dokladu` na jednom mieste.

  Zdroj pravdy je migrácia `*_zamok_obdobia_storno_duzp.sql`; test
  `zamok-obdobia.test.ts` drží zhodu zoznamov (argumenty spúšťačov) aj ľudských
  názvov polí (`nazov_pola_dokladu`). Pole pridané sem patrí aj do migrácie.

  Pravidlo:
  - doklad je v účtovníctve: vydaná/prijatá nie je koncept, stornovaná ani
    zmazaná; bloček nie je nespracovaný (`new`),
  - je v uzavretom období, keď do zámku padá: vydaná — deň vystavenia alebo
    deň dane (`denDaneVystavenej`); prijatá — LEN deň odpočtu (`denOdpoctu`),
    takže neskoro prijatú faktúru z uzavretého mesiaca možno zapísať; bloček —
    deň vystavenia,
  - posudzuje sa starý aj nový stav — doklad sa nedá presunúť ani DO, ani Z
    uzavretého obdobia,
  - vstup do účtovníctva (nový doklad, vystavenie konceptu, obnovenie storna,
    spracovanie bločku) aj odchod (storno, zmazanie, návrat na koncept) je
    v uzavretom období zakázaný,
  - inak sa nesmú meniť vymenované polia. Úhrada, predkontácia, stredisko,
    činnosť, rozúčtovanie, poznámky, zákazka, štítky a odovzdanie do Pohody
    ostávajú voľné.
*/
import { denOdpoctu } from "./datum-prijatia";
import { denDaneVystavenej } from "./dph-prehlad";

export type TabulkaZamku = "invoices" | "purchase_invoices" | "expense_documents";

/** Vydaná faktúra — argumenty spúšťača `invoices_locked_period`. */
export const ZAMOK_OBDOBIA_FAKTURY = [
  "issue_date",
  "delivery_date",
  "povodna_splatnost",
  "invoice_number",
  "type",
  "currency",
  "exchange_rate",
  "exchange_rate_date",
  "customer_id",
  "customer_name",
  "customer_ico",
  "customer_dic",
  "customer_ic_dph",
  "customer_country",
  "subtotal",
  "vat_total",
  "total",
  "subtotal_eur",
  "vat_total_eur",
  "total_eur",
  "discount_total",
  "discount_type",
  "discount_value",
  "rounding_mode",
  "reverse_charge",
  "reverse_charge_type",
  "pdp_druh",
  "eu_plnenie",
  "oss",
  "oss_country",
  "osobitna_uprava",
  "oprava_25a",
  "opravuje_fakturu_id",
  "advance_invoice_id",
  "advance_amount",
  "pohoda_clenenie_dph",
  "kv_clenenie",
  "cancelled_at",
  "deleted_at",
] as const;

/** Prijatá faktúra — argumenty spúšťača `purchase_invoices_locked_period`. */
export const ZAMOK_OBDOBIA_PRIJATEJ = [
  "type",
  "invoice_number",
  "issue_date",
  "delivery_date",
  "received_date",
  "povodna_splatnost",
  "supplier_name",
  "supplier_ico",
  "supplier_dic",
  "supplier_ic_dph",
  "supplier_country",
  "amount_without_vat",
  "vat_amount",
  "amount_total",
  "amount_without_vat_eur",
  "vat_amount_eur",
  "discount_total",
  "items",
  "vat_breakdown",
  "currency",
  "exchange_rate",
  "dph_rezim",
  "reverse_charge",
  "reverse_charge_type",
  "eu_plnenie",
  "osobitna_uprava",
  "odpocet",
  "opravuje_cislo",
  "opravuje_id",
  "advance_invoice_id",
  "advance_amount",
  "samofakturacia",
  "pohoda_clenenie_dph",
  "kv_clenenie",
  "deleted_at",
] as const;

/** Bloček (`expense_documents`) — argumenty spúšťača `expense_documents_locked_period`. */
export const ZAMOK_OBDOBIA_DOKLADU = [
  "issue_date",
  "document_number",
  "supplier_name",
  "supplier_ico",
  "supplier_dic",
  "supplier_ic_dph",
  "supplier_country",
  "total_amount",
  "net_amount",
  "vat_amount",
  "vat_rate",
  "vat_breakdown",
  "items",
  "currency",
  "exchange_rate",
  "odpocet",
  "pohoda_clenenie_dph",
  "kv_clenenie",
] as const;

/** Položka vydanej faktúry — argumenty spúšťača `invoice_items_locked_period`. */
export const ZAMOK_OBDOBIA_POLOZKY = [
  "invoice_id",
  "name",
  "description",
  "quantity",
  "unit",
  "unit_price",
  "discount_percent",
  "vat_rate",
  "subtotal",
  "vat_amount",
  "total",
  "prenesenie",
  "pohoda_clenenie_dph",
  "kv_clenenie",
  "colny_kod",
  "krajina_povodu",
  "hmotnost_kg",
] as const;

export const ZAMOK_OBDOBIA: Record<TabulkaZamku, readonly string[]> = {
  invoices: ZAMOK_OBDOBIA_FAKTURY,
  purchase_invoices: ZAMOK_OBDOBIA_PRIJATEJ,
  expense_documents: ZAMOK_OBDOBIA_DOKLADU,
};

/** Zaúčtovacie údaje riadku v `items`, ktoré sa smú doplniť aj po uzávierke. */
export const VOLNE_V_POLOZKACH = ["predkontacia", "pohoda_predkontacia", "stredisko", "cinnost"] as const;

/** Ľudské názvy polí do hlášok (`nazov_pola_dokladu` v SQL). */
export const NAZVY_POLI: Record<string, string> = {
  issue_date: "dátum vystavenia",
  delivery_date: "dátum dodania",
  received_date: "dátum prijatia",
  due_date: "splatnosť",
  povodna_splatnost: "pôvodná splatnosť",
  invoice_number: "číslo dokladu",
  document_number: "číslo dokladu",
  number_series_id: "číselný rad",
  sequence_number: "poradové číslo",
  type: "druh dokladu",
  status: "stav dokladu",
  currency: "mena",
  exchange_rate: "kurz",
  exchange_rate_date: "dátum kurzu",
  subtotal: "základ dane",
  amount_without_vat: "základ dane",
  net_amount: "základ dane",
  vat_total: "DPH",
  vat_amount: "DPH",
  total: "suma spolu",
  amount_total: "suma spolu",
  total_amount: "suma spolu",
  subtotal_eur: "základ dane v eurách",
  amount_without_vat_eur: "základ dane v eurách",
  vat_total_eur: "DPH v eurách",
  vat_amount_eur: "DPH v eurách",
  total_eur: "suma v eurách",
  discount_total: "zľava",
  discount_type: "zľava",
  discount_value: "zľava",
  discount_percent: "zľava položky",
  rounding_mode: "zaokrúhlenie",
  customer_id: "odberateľ",
  customer_name: "názov odberateľa",
  customer_ico: "IČO odberateľa",
  customer_dic: "DIČ odberateľa",
  customer_ic_dph: "IČ DPH odberateľa",
  customer_country: "krajina odberateľa",
  customer_street: "adresa odberateľa",
  customer_city: "adresa odberateľa",
  customer_zip: "adresa odberateľa",
  customer_email: "e-mail odberateľa",
  supplier_name: "názov dodávateľa",
  supplier_ico: "IČO dodávateľa",
  supplier_dic: "DIČ dodávateľa",
  supplier_ic_dph: "IČ DPH dodávateľa",
  supplier_country: "krajina dodávateľa",
  supplier_street: "adresa dodávateľa",
  supplier_city: "adresa dodávateľa",
  supplier_zip: "adresa dodávateľa",
  supplier_iban: "IBAN dodávateľa",
  variable_symbol: "variabilný symbol",
  constant_symbol: "konštantný symbol",
  specific_symbol: "špecifický symbol",
  order_number: "číslo objednávky",
  delivery_note_number: "číslo dodacieho listu",
  reverse_charge: "prenesenie daňovej povinnosti",
  reverse_charge_type: "druh prenesenia daňovej povinnosti",
  pdp_druh: "druh prenesenia daňovej povinnosti",
  prenesenie: "prenesenie daňovej povinnosti",
  eu_plnenie: "plnenie v rámci EÚ",
  oss: "režim OSS",
  oss_country: "krajina OSS",
  osobitna_uprava: "osobitná úprava DPH",
  oprava_25a: "oprava podľa § 25a",
  opravuje_fakturu_id: "opravovaná faktúra",
  opravuje_cislo: "opravovaná faktúra",
  opravuje_id: "opravovaná faktúra",
  advance_invoice_id: "zálohová faktúra",
  advance_amount: "odpočet zálohy",
  dph_rezim: "režim DPH",
  odpocet: "odpočet DPH",
  samofakturacia: "samofakturácia",
  items: "položky",
  vat_breakdown: "rozpis DPH",
  vat_rate: "sadzba DPH",
  pohoda_clenenie_dph: "členenie DPH",
  kv_clenenie: "členenie kontrolného výkazu",
  pohoda_predkontacia: "predkontácia",
  rozuctovanie: "rozúčtovanie",
  stredisko: "stredisko",
  cinnost: "činnosť",
  pohoda_rad: "číselný rad v Pohode",
  pohoda_pokladna: "pokladňa v Pohode",
  vyuctovanie_id: "vyúčtovanie",
  job_id: "zákazka",
  category: "kategória",
  payment_method: "spôsob úhrady",
  intro_note: "úvodný text",
  notes: "poznámka",
  note: "poznámka",
  cancelled_at: "storno",
  deleted_at: "zmazanie",
  invoice_id: "faktúra položky",
  position: "poradie položky",
  name: "názov položky",
  description: "popis položky",
  quantity: "množstvo",
  unit: "jednotka",
  unit_price: "jednotková cena",
  colny_kod: "colný kód",
  krajina_povodu: "krajina pôvodu",
  hmotnost_kg: "hmotnosť",
  entry_date: "dátum",
  entry_number: "číslo dokladu",
  amount: "suma",
  trip_date: "dátum jazdy",
  vehicle_id: "vozidlo",
  driver_name: "vodič",
  start_location: "miesto odchodu",
  end_location: "miesto príchodu",
  purpose: "účel jazdy",
  start_odometer: "stav tachometra",
  end_odometer: "stav tachometra",
  distance_km: "vzdialenosť",
  fuel_price: "cena paliva",
  fuel_consumption: "spotreba",
};

export function nazovPola(pole: string): string {
  return NAZVY_POLI[pole] ?? "údaje dokladu";
}

type Riadok = Record<string, unknown>;

const den = (v: unknown): string | null => {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/**
 * Deň, ktorý o zámku rozhoduje (`zamok_obdobia_den` v SQL): vydaná — skorší
 * z dňa vystavenia a dňa dane; prijatá — len deň odpočtu; bloček — vystavenie.
 */
export function denZamku(tab: TabulkaZamku, r: Riadok | null | undefined): string | null {
  if (!r) return null;
  // Prijatá: len deň odpočtu (vystavená v uzavretom období, prijatá neskôr je voľná).
  if (tab === "purchase_invoices") return den(denOdpoctu(r as never));
  const dni = [den(r.issue_date)];
  if (tab === "invoices") dni.push(den(denDaneVystavenej(r as never)));
  const platne = dni.filter((d): d is string => Boolean(d)).sort();
  return platne[0] ?? null;
}

/** Je doklad v účtovníctve (a teda vo výkaze DPH)? */
export function vUctovnictve(tab: TabulkaZamku, r: Riadok | null | undefined): boolean {
  if (!r) return false;
  if (tab === "expense_documents") return String(r.status ?? "new") !== "new";
  return !["draft", "cancelled"].includes(String(r.status ?? "")) && !r.deleted_at;
}

/** Padá deň dokladu do uzavretého obdobia (bez ohľadu na stav dokladu)? */
export function denVZamku(
  tab: TabulkaZamku,
  r: Riadok | null | undefined,
  zamknuteDo: string | null | undefined,
): boolean {
  if (!zamknuteDo) return false;
  const d = denZamku(tab, r);
  return Boolean(d && d <= String(zamknuteDo).slice(0, 10));
}

/** Je doklad v uzavretom období (v účtovníctve a deň v zámku)? */
export function jeVZamknutomObdobi(
  tab: TabulkaZamku,
  r: Riadok | null | undefined,
  zamknuteDo: string | null | undefined,
): boolean {
  return vUctovnictve(tab, r) && denVZamku(tab, r, zamknuteDo);
}

export type PorusenieObdobia =
  | { dovod: "zmazanie" | "vstup" | "odchod" | "storno" }
  | { dovod: "pole"; pole: string };

const bezVolnychVPolozkach = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map((x) => {
        if (!x || typeof x !== "object" || Array.isArray(x)) return x;
        const k: Riadok = { ...(x as Riadok) };
        for (const p of VOLNE_V_POLOZKACH) delete k[p];
        return k;
      })
    : v;

/**
 * Logika spúšťača `guard_locked_period_dokladu` v TS — pre API a testy.
 * `stary` null = vloženie, `novy` null = zmazanie. Vráti `null`, keď zápis
 * prejde.
 */
export function porusenieZamkuObdobia(
  tab: TabulkaZamku,
  stary: Riadok | null,
  novy: Riadok | null,
  zamknuteDo: string | null | undefined,
): PorusenieObdobia | null {
  if (!zamknuteDo) return null;
  const sUcty = vUctovnictve(tab, stary);
  const nUcty = vUctovnictve(tab, novy);
  const sZam = sUcty && denVZamku(tab, stary, zamknuteDo);
  const nZam = nUcty && denVZamku(tab, novy, zamknuteDo);
  if (!sZam && !nZam) return null;
  if (!novy) return { dovod: "zmazanie" };
  if (!sUcty) return { dovod: "vstup" };
  if (!nUcty) {
    if (tab !== "expense_documents" && novy.status === "cancelled") return { dovod: "storno" };
    if (novy.deleted_at) return { dovod: "zmazanie" };
    return { dovod: "odchod" };
  }
  for (const p of ZAMOK_OBDOBIA[tab]) {
    const a = p === "items" ? bezVolnychVPolozkach(stary?.[p]) : stary?.[p];
    const b = p === "items" ? bezVolnychVPolozkach(novy[p]) : novy[p];
    if (!rovnake(a, b)) return p === "cancelled_at" ? { dovod: "storno" } : { dovod: "pole", pole: p };
  }
  if (denZamku(tab, stary) !== denZamku(tab, novy)) return { dovod: "pole", pole: "delivery_date" };
  return null;
}

const OPRAVA: Record<TabulkaZamku | "invoice_items", string> = {
  invoices: "Odomknite obdobie, alebo vystavte dobropis v otvorenom období.",
  invoice_items: "Odomknite obdobie, alebo vystavte dobropis v otvorenom období.",
  purchase_invoices: "Odomknite obdobie, alebo zaevidujte dobropis od dodávateľa v otvorenom období.",
  expense_documents: "Odomknite obdobie, alebo opravu zaevidujte v otvorenom období.",
};

/** Hláška ako v SQL (`zamok_obdobia_hlaska`). */
export function hlaskaZamkuObdobia(
  tab: TabulkaZamku | "invoice_items",
  p: PorusenieObdobia,
  zamknuteDo: string,
): string {
  const [r, m, d] = String(zamknuteDo).slice(0, 10).split("-");
  const uvod = `Obdobie je uzamknuté do ${d}.${m}.${r}. `;
  const oprava = OPRAVA[tab];
  switch (p.dovod) {
    case "storno":
      return `${uvod}Faktúru z uzavretého obdobia už nemožno stornovať. ${oprava}`;
    case "zmazanie":
      return `${uvod}Doklad z uzavretého obdobia sa už nedá meniť ani mazať. ${oprava}`;
    case "vstup":
      return `${uvod}Doklad, ktorý patrí do uzavretého obdobia, sa už nedá pridať ani vystaviť — zmeňte dátum na otvorené obdobie, alebo obdobie odomknite.`;
    case "odchod":
      return `${uvod}Doklad z uzavretého obdobia už nemožno vrátiť medzi koncepty ani nespracované. ${oprava}`;
    default:
      if (tab === "invoice_items")
        return `${uvod}Položky faktúry z uzavretého obdobia sa už nedajú meniť (${nazovPola(p.pole)}). ${oprava}`;
      return `${uvod}Doklad z uzavretého obdobia sa už nedá meniť ani mazať (${nazovPola(p.pole)}). ${oprava}`;
  }
}

/** Porovnanie ako `jsonb is distinct from` — čísla a reťazce podľa hodnoty. */
function rovnake(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === "number" || typeof b === "number") {
    const x = Number(a);
    const y = Number(b);
    if (Number.isFinite(x) && Number.isFinite(y)) return Math.abs(x - y) < 0.0001;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}
