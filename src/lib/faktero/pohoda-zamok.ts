/*
  Zámok dokladu odovzdaného do Pohody — zoznamy polí na jednom mieste.

  Po odovzdaní je doklad v Pohode a Faktero o tom, čo tam je, vie len z
  odoslaného XML. Každá zmena poľa, ktoré v XML ide, by znamenala, že Pohoda a
  Faktero tvrdia o tom istom doklade niečo iné (audit 22. 10. 2026: faktúra
  prepnutá na prenesenie daňovej povinnosti po odovzdaní, zmazané faktúry,
  ktoré v Pohode ostali). Spúšťače v databáze preto tieto polia po odovzdaní
  nepustia; zmeniť ich ide až po „Vrátiť z Pohody“.

  Zoznamy tu sú zdrojom pre migráciu (`supabase/migrations/*pohoda_zamok.sql`)
  — test `pohoda-zamok.test.ts` kontroluje, že SQL nesie presne tieto polia.
  Pole, ktoré sa začne zapisovať do XML, patrí sem aj do migrácie.
*/

/**
 * Vydaná faktúra (`invoices`) — všetko, čo číta `polozkyFaktur` / `POHODA_XML`
 * (a ostatné formáty exportu), plus väzby, ktoré menia sumy.
 *
 * Voľné ostáva: úhrada (`paid_at`, stav uhradená), odoslanie (`sent_at`),
 * PDF, interná poznámka, zákazka (`job_id`), upomienky, schvaľovanie,
 * zaúčtovanie (`zauctovane_at`) a technické stĺpce.
 */
export const ZAMOK_FAKTURY = [
  // druh a číslo
  "type",
  "invoice_number",
  "number_series_id",
  "sequence_number",
  "variable_symbol",
  "constant_symbol",
  "specific_symbol",
  "order_number",
  // dátumy
  "issue_date",
  "delivery_date",
  "due_date",
  // odberateľ
  "customer_id",
  "customer_name",
  "customer_street",
  "customer_city",
  "customer_zip",
  "customer_country",
  "customer_ico",
  "customer_dic",
  "customer_ic_dph",
  "customer_email",
  // sumy
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
  "advance_invoice_id",
  "advance_amount",
  // DPH režim
  "reverse_charge",
  "reverse_charge_type",
  "eu_plnenie",
  "oss",
  "oss_country",
  "osobitna_uprava",
  "oprava_25a",
  "opravuje_fakturu_id",
  // mena
  "currency",
  "exchange_rate",
  "exchange_rate_date",
  // texty v XML
  "intro_note",
  "notes",
  "payment_method",
  // zaúčtovanie
  "pohoda_predkontacia",
  "pohoda_clenenie_dph",
  "kv_clenenie",
  "stredisko",
  "cinnost",
  // storno a zmazanie
  "cancelled_at",
  "deleted_at",
] as const;

/** Položka vydanej faktúry — každé pole, ktoré ide do `invoiceItem`. */
export const ZAMOK_POLOZKY_FAKTURY = [
  "invoice_id",
  "position",
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
  "colny_kod",
  "krajina_povodu",
  "hmotnost_kg",
  "pohoda_predkontacia",
  "pohoda_clenenie_dph",
  "kv_clenenie",
] as const;

/**
 * Prijatá faktúra (`purchase_invoices`) — `prijataAkoDoklad` + `polozkyDokladov`.
 * Úhrada (`payment_date`, `status`), príloha a štítky ostávajú voľné.
 */
export const ZAMOK_PRIJATEJ = [
  "type",
  "invoice_number",
  "variable_symbol",
  "constant_symbol",
  "specific_symbol",
  "order_number",
  "delivery_note_number",
  "opravuje_cislo",
  "issue_date",
  "delivery_date",
  "due_date",
  "supplier_name",
  "supplier_ico",
  "supplier_dic",
  "supplier_ic_dph",
  "supplier_street",
  "supplier_city",
  "supplier_zip",
  "supplier_country",
  "supplier_iban",
  "amount_without_vat",
  "vat_amount",
  "amount_total",
  "discount_total",
  "items",
  "currency",
  "exchange_rate",
  "dph_rezim",
  "reverse_charge",
  "odpocet",
  "payment_method",
  "intro_note",
  "note",
  "pohoda_predkontacia",
  "pohoda_clenenie_dph",
  "kv_clenenie",
  "rozuctovanie",
  "stredisko",
  "cinnost",
  "pohoda_rad",
  "job_id",
  "category",
  "deleted_at",
] as const;

/** Bloček a výdavkový doklad (`expense_documents`) — `polozkyDokladov`. */
export const ZAMOK_DOKLADU = [
  "supplier_name",
  "supplier_ico",
  "supplier_ic_dph",
  "document_number",
  "issue_date",
  "total_amount",
  "vat_amount",
  "net_amount",
  "vat_rate",
  "vat_breakdown",
  "items",
  "currency",
  "payment_method",
  "odpocet",
  "note",
  "pohoda_predkontacia",
  "pohoda_clenenie_dph",
  "kv_clenenie",
  "rozuctovanie",
  "stredisko",
  "cinnost",
  "pohoda_rad",
  "pohoda_pokladna",
  "vyuctovanie_id",
  "job_id",
  "category",
] as const;

/** Polia vydanej faktúry, ktorých zmenu zapisuje `historia_dokladov` (agenda `faktura`). */
export const HISTORIA_FAKTURY = [
  "invoice_number",
  "type",
  "issue_date",
  "delivery_date",
  "due_date",
  "customer_name",
  "customer_ico",
  "customer_ic_dph",
  "subtotal",
  "vat_total",
  "total",
  "currency",
  "exchange_rate",
  "reverse_charge",
  "variable_symbol",
  "status",
  "sent_at",
  "paid_at",
  "pohoda_predkontacia",
  "pohoda_clenenie_dph",
  "kv_clenenie",
  "zauctovane_at",
  "exported_at",
  "deleted_at",
] as const;

/** Hláška spúšťača pri vydanej faktúre — rovnaký text ako v migrácii. */
export const HLASKA_ZAMKU_FAKTURY =
  "Faktúra už bola odovzdaná do Pohody — najprv ju vráťte z Pohody (Exporty → Vrátiť), potom ju upravte.";

/** Stavy, do ktorých odovzdaná faktúra prejsť nesmie (storno, späť na koncept). */
export const ZAKAZANE_STAVY_PO_ODOVZDANI = ["cancelled", "draft"] as const;

/**
 * Logika spúšťača `zamok_odovzdanej_faktury` v TS — pre testy a pre
 * rozhranie (vopred povedať, čo neprejde). Vráti prvé zamknuté pole, ktoré by
 * sa zmenilo, alebo `null`.
 *
 * `servis` = zápis servisným kľúčom alebo databázovou funkciou (admin opravy,
 * prepočet `exported_at` z `export_logs`) — ten zámok nepúta.
 */
export function porusenieZamkuFaktury(
  stara: Record<string, unknown>,
  nova: Record<string, unknown> | null,
  servis = false,
  /**
   * Pohoda import potvrdila a vrátila svoje číslo (`export_logs.pohoda_cislo`)
   * — storno potom ide do Pohody ako stornujúci doklad (`nacitajStorna`), takže
   * zrušiť faktúru sa smie.
   */
  stornoDoPohody = false,
): string | null {
  if (servis) return null;
  if (!stara?.exported_at) return null;
  if (nova === null) return "_zmazanie";
  // Odovzdanie ruší len vrátenie (história v export_logs), nie priamy zápis.
  if (!rovnake(stara.exported_at, nova.exported_at)) return "exported_at";
  const storno =
    stornoDoPohody && String(nova.status) === "cancelled" && String(stara.status) !== "cancelled";
  for (const p of ZAMOK_FAKTURY) {
    if (storno && p === "cancelled_at") continue;
    if (!rovnake(stara[p], nova[p])) return p;
  }
  if (storno) return null;
  if (
    !rovnake(stara.status, nova.status) &&
    ((ZAKAZANE_STAVY_PO_ODOVZDANI as readonly string[]).includes(String(nova.status)) ||
      String(stara.status) === "cancelled")
  )
    return "status";
  return null;
}

/** Položka faktúry: vloženie, zmazanie aj zmena zamknutého poľa odovzdanej faktúry. */
export function porusenieZamkuPolozky(
  fakturaOdovzdana: boolean,
  stara: Record<string, unknown> | null,
  nova: Record<string, unknown> | null,
  servis = false,
): string | null {
  if (servis || !fakturaOdovzdana) return null;
  if (!stara) return "_vlozenie";
  if (!nova) return "_zmazanie";
  for (const p of ZAMOK_POLOZKY_FAKTURY) if (!rovnake(stara[p], nova[p])) return p;
  return null;
}

/**
 * Prijatá faktúra a bloček (`zamok_odovzdaneho_dokladu`): zmena, ktorá
 * zároveň ruší odovzdanie (`exported_at` → null), je vrátenie z Pohody a
 * prejde. Mazanie odovzdaného dokladu nie.
 */
export function porusenieZamkuDokladu(
  polia: readonly string[],
  stary: Record<string, unknown>,
  novy: Record<string, unknown> | null,
  servis = false,
): string | null {
  if (servis) return null;
  if (novy === null) return stary?.exported_at ? "_zmazanie" : null;
  const odovzdany = Boolean(stary?.exported_at) && Boolean(novy?.exported_at);
  const zamknuty = Boolean(stary?.locked_at) && Boolean(novy?.locked_at);
  if (!odovzdany && !zamknuty) return null;
  for (const p of polia) if (!rovnake(stary[p], novy[p])) return p;
  return null;
}

/** Porovnanie ako `jsonb is distinct from` — čísla a reťazce podľa hodnoty. */
function rovnake(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === "number" || typeof b === "number") {
    const x = Number(a);
    const y = Number(b);
    if (Number.isFinite(x) && Number.isFinite(y)) return x === y;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}
