// Server-side parsers that turn a vendor export (Money S3, Omega, iDoklad, KROS)
// into an array of canonical rows keyed by SuperFaktura's FieldKey names, so we
// can reuse the existing `runImport` pipeline with an identity mapping.
import { XMLParser } from "fast-xml-parser";
import type { FieldKey } from "./import-superfaktura.server";
import { parseCsv } from "./import-superfaktura.server";

export type VendorSource = "money-s3" | "omega" | "idoklad" | "kros";
export type CanonicalRow = Partial<Record<FieldKey, string>>;

// Windows-1250 → UTF-8 (Slovak accounting exports frequently use CP1250).
// If the bytes are already UTF-8 we detect a BOM or fail-safe decode via TextDecoder.
function decodeBytes(bytes: Uint8Array): string {
  // Try UTF-8 first — if it hits replacement chars often, fall back to windows-1250.
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const bad = (utf8.match(/\uFFFD/g) ?? []).length;
  if (bad < 3) return utf8.replace(/^\uFEFF/, "");
  try {
    return new TextDecoder("windows-1250" as any).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return utf8;
  }
}

function pickFirst(obj: any, ...keys: string[]): string {
  if (!obj) return "";
  for (const k of keys) {
    // case-insensitive search
    const found = Object.keys(obj).find((x) => x.toLowerCase() === k.toLowerCase());
    if (found != null) {
      const v = obj[found];
      if (v == null) continue;
      if (typeof v === "object") continue;
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return "";
}

function asArray<T = any>(v: any): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function normalizeDate(v: string): string {
  if (!v) return "";
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s;
}

function num(v: string): string {
  if (!v) return "";
  return v.replace(/\s/g, "").replace(",", ".");
}

// ---------------------------------------------------------------------------
// Money S3 (Stormware) — MoneyData XML
// Typical structure:
//   <MoneyData> <SeznamFaktVyd> <FaktVyd> <Doklad>… <DatVyst>… <DatSplat>…
//     <Firma><ObchNazev/><ICO/><DIC/><Ulice/><Mesto/><PSC/></Firma>
//     <Kc>… <KcBezDph>… <KcDph>… <VarSym>… <TextPredKonc/>
//     <SeznamPolozek><Polozka><Nazev/><PocetMj/><Cena/><SazbaDph/></Polozka>…
//     </SeznamPolozek></FaktVyd> …</SeznamFaktVyd></MoneyData>
// We tolerate variants: `_MoneyData`, mixed casing, additional wrappers.
// ---------------------------------------------------------------------------
function parseMoneyS3(bytes: Uint8Array): CanonicalRow[] {
  const xml = decodeBytes(bytes);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", trimValues: true });
  const obj = parser.parse(xml);
  const root = obj?.MoneyData ?? obj?._MoneyData ?? obj?.moneydata ?? obj?.["_MoneyData"] ?? obj;

  const list =
    root?.SeznamFaktVyd?.FaktVyd ??
    root?.SeznamFaktPri?.FaktPri ??
    root?.Faktury?.Faktura ??
    [];
  const invoices = asArray(list);
  const rows: CanonicalRow[] = [];

  for (const inv of invoices) {
    const firma = inv.Firma ?? inv.Odberatel ?? inv.Partner ?? {};
    const adresa = firma.Adresa ?? firma;
    const invNo = pickFirst(inv, "Doklad", "Cislo", "CisloDokladu", "Number");
    const items = asArray(inv.SeznamPolozek?.Polozka ?? inv.Polozky?.Polozka ?? inv.Item);

    const head: CanonicalRow = {
      invoice_number: invNo,
      variable_symbol: pickFirst(inv, "VarSym", "VariabilniSymbol"),
      issue_date: normalizeDate(pickFirst(inv, "DatVyst", "DatumVystaveni")),
      due_date: normalizeDate(pickFirst(inv, "DatSplat", "DatumSplatnosti")),
      delivery_date: normalizeDate(pickFirst(inv, "DatPln", "DatumPlneni", "DatumDodani")),
      currency: pickFirst(inv, "Mena", "Currency") || "EUR",
      subtotal: num(pickFirst(inv, "KcBezDph", "CelkemBezDph", "ZakladDph")),
      vat_total: num(pickFirst(inv, "KcDph", "Dph")),
      total: num(pickFirst(inv, "Kc", "Celkem", "KcCelkem", "Total")),
      notes: pickFirst(inv, "TextPredKonc", "Poznamka", "TextPred"),
      external_id: pickFirst(inv, "ID", "GUID"),
      customer_name: pickFirst(firma, "ObchNazev", "Nazev", "Name"),
      customer_ico: pickFirst(firma, "ICO", "IC"),
      customer_dic: pickFirst(firma, "DIC"),
      customer_ic_dph: pickFirst(firma, "ICDPH", "IcDph"),
      customer_email: pickFirst(firma, "Email"),
      customer_phone: pickFirst(firma, "Tel", "Telefon", "Phone"),
      customer_street: pickFirst(adresa, "Ulice", "Ulica", "Street"),
      customer_city: pickFirst(adresa, "Mesto", "City"),
      customer_zip: pickFirst(adresa, "PSC", "Zip"),
      customer_country: pickFirst(adresa, "Stat", "Country") || "SK",
    };

    if (items.length === 0) {
      rows.push(head);
      continue;
    }
    for (const it of items) {
      rows.push({
        ...head,
        item_name: pickFirst(it, "Nazev", "Popis", "Name"),
        item_description: pickFirst(it, "Popis", "Description"),
        item_quantity: num(pickFirst(it, "PocetMj", "Mnozstvo", "Quantity")),
        item_unit: pickFirst(it, "Jednotka", "MJ", "Unit") || "ks",
        item_unit_price: num(pickFirst(it, "Cena", "CenaMj", "UnitPrice")),
        item_vat_rate: num(pickFirst(it, "SazbaDph", "DphSaz", "VatRate")),
        item_total: num(pickFirst(it, "CenaCelkem", "Celkem", "Total")),
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Generic CSV mapper — covers Omega, iDoklad, KROS CSV exports.
// Each vendor has slightly different column names; we match case-insensitively
// against a synonym list per canonical field.
// ---------------------------------------------------------------------------
const CSV_SYNONYMS: Record<FieldKey, string[]> = {
  invoice_number: ["cislo dokladu", "cislo faktury", "cislo", "doklad", "číslo dokladu", "číslo faktúry", "číslo", "invoice number"],
  variable_symbol: ["variabilny symbol", "variabilní symbol", "vs", "var symbol"],
  issue_date: ["datum vystavenia", "datum vystaveni", "dátum vystavenia", "date issued", "issue date"],
  due_date: ["datum splatnosti", "dátum splatnosti", "splatnost", "splatnosť", "due date"],
  delivery_date: ["datum dodania", "dátum dodania", "datum plneni", "delivery date", "dátum dodania tovaru"],
  status: ["stav", "status", "uhradene", "uhradené"],
  currency: ["mena", "currency"],
  subtotal: ["suma bez dph", "základ dph", "zaklad dph", "celkom bez dph", "cena bez dph", "netto"],
  vat_total: ["dph", "dph spolu", "dan", "daň", "vat"],
  total: ["celkom s dph", "suma s dph", "celkom", "spolu", "suma celkom", "k uhrade", "k úhrade", "total"],
  notes: ["poznamka", "poznámka", "note"],
  external_id: ["id", "external id", "guid"],
  customer_name: ["odberatel", "odberateľ", "odberatel - nazov", "odberateľ - názov", "nazov odberatela", "názov odberateľa", "obchodne meno", "obchodné meno", "firma", "customer", "zakaznik"],
  customer_ico: ["ico", "ičo"],
  customer_dic: ["dic", "dič"],
  customer_ic_dph: ["ic dph", "ič dph", "icdph", "vat id"],
  customer_email: ["email", "e-mail"],
  customer_phone: ["telefon", "telefón", "phone"],
  customer_street: ["ulica", "adresa", "street"],
  customer_city: ["mesto", "city"],
  customer_zip: ["psc", "psč", "zip"],
  customer_country: ["stat", "štát", "krajina", "country"],
  item_name: ["polozka", "položka", "nazov polozky", "názov položky", "item name", "produkt"],
  item_description: ["popis", "description"],
  item_quantity: ["mnozstvo", "množstvo", "pocet", "počet", "quantity"],
  item_unit: ["mj", "jednotka", "unit"],
  item_unit_price: ["cena za mj", "cena jedn", "jednotkova cena", "jednotková cena", "unit price"],
  item_vat_rate: ["sadzba dph", "% dph", "vat rate"],
  item_total: ["cena celkom", "polozka spolu", "položka spolu", "item total"],
};

function normHeader(s: string): string {
  return (s ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function detectMapping(headers: string[]): Partial<Record<FieldKey, string>> {
  const mapping: Partial<Record<FieldKey, string>> = {};
  const normed = headers.map((h) => ({ raw: h, n: normHeader(h) }));
  for (const [field, syns] of Object.entries(CSV_SYNONYMS) as [FieldKey, string[]][]) {
    for (const s of syns) {
      const ns = normHeader(s);
      const hit = normed.find((h) => h.n === ns || h.n.includes(ns));
      if (hit) { mapping[field] = hit.raw; break; }
    }
  }
  return mapping;
}

function csvToCanonical(text: string): CanonicalRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const map = detectMapping(headers);
  return rows.map((r) => {
    const out: CanonicalRow = {};
    for (const [field, header] of Object.entries(map) as [FieldKey, string][]) {
      const v = r[header];
      if (v == null || v === "") continue;
      if (field === "issue_date" || field === "due_date" || field === "delivery_date") out[field] = normalizeDate(v);
      else if (field.match(/subtotal|vat_total|total|item_(quantity|unit_price|vat_rate|total)/)) out[field] = num(v);
      else out[field] = String(v).trim();
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// KROS XML — supports both ISDOC and KROS-native XML by walking any structure
// that contains `<Faktura>` / `<Doklad>` elements with typical Slovak field names.
// ---------------------------------------------------------------------------
function parseKrosXml(bytes: Uint8Array): CanonicalRow[] {
  const xml = decodeBytes(bytes);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", trimValues: true });
  const obj = parser.parse(xml);

  const invoiceNodes: any[] = [];
  (function walk(n: any) {
    if (!n || typeof n !== "object") return;
    for (const [k, v] of Object.entries(n)) {
      const kl = k.toLowerCase();
      if ((kl === "faktura" || kl === "invoice" || kl === "doklad") && v && typeof v === "object") {
        for (const one of asArray(v)) invoiceNodes.push(one);
      } else if (typeof v === "object") walk(v);
    }
  })(obj);

  const rows: CanonicalRow[] = [];
  for (const inv of invoiceNodes) {
    const partner = inv.Odberatel ?? inv.Partner ?? inv.Kupujuci ?? inv.Firma ?? {};
    const addr = partner.Adresa ?? partner;
    const items = asArray(inv.Polozky?.Polozka ?? inv.Riadky?.Riadok ?? inv.Item ?? []);
    const head: CanonicalRow = {
      invoice_number: pickFirst(inv, "Cislo", "CisloFaktury", "CisloDokladu", "Number"),
      variable_symbol: pickFirst(inv, "VS", "VariabilnySymbol"),
      issue_date: normalizeDate(pickFirst(inv, "DatumVystavenia", "DatVyst")),
      due_date: normalizeDate(pickFirst(inv, "DatumSplatnosti", "DatSplat")),
      delivery_date: normalizeDate(pickFirst(inv, "DatumDodania", "DatDodania")),
      currency: pickFirst(inv, "Mena", "Currency") || "EUR",
      subtotal: num(pickFirst(inv, "SumaBezDph", "ZakladDph")),
      vat_total: num(pickFirst(inv, "Dph", "SumaDph")),
      total: num(pickFirst(inv, "SumaSDph", "Celkom", "Total")),
      notes: pickFirst(inv, "Poznamka"),
      customer_name: pickFirst(partner, "Nazov", "ObchodneMeno", "Name"),
      customer_ico: pickFirst(partner, "ICO", "Ico"),
      customer_dic: pickFirst(partner, "DIC", "Dic"),
      customer_ic_dph: pickFirst(partner, "ICDPH", "IcDph"),
      customer_email: pickFirst(partner, "Email"),
      customer_phone: pickFirst(partner, "Telefon"),
      customer_street: pickFirst(addr, "Ulica", "Street"),
      customer_city: pickFirst(addr, "Mesto", "City"),
      customer_zip: pickFirst(addr, "PSC", "Zip"),
      customer_country: pickFirst(addr, "Krajina", "Stat", "Country") || "SK",
    };
    if (items.length === 0) { rows.push(head); continue; }
    for (const it of items) {
      rows.push({
        ...head,
        item_name: pickFirst(it, "Nazov", "Popis", "Name"),
        item_description: pickFirst(it, "Popis", "Description"),
        item_quantity: num(pickFirst(it, "Mnozstvo", "Pocet", "Quantity")),
        item_unit: pickFirst(it, "MJ", "Jednotka", "Unit") || "ks",
        item_unit_price: num(pickFirst(it, "JednotkovaCena", "CenaJedn", "UnitPrice")),
        item_vat_rate: num(pickFirst(it, "SadzbaDph", "DphSaz")),
        item_total: num(pickFirst(it, "SumaCelkom", "Celkom", "Total")),
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
export function parseVendorFile(source: VendorSource, fileName: string, bytes: Uint8Array): CanonicalRow[] {
  const lower = fileName.toLowerCase();
  const isXml = lower.endsWith(".xml");
  switch (source) {
    case "money-s3":
      return parseMoneyS3(bytes);
    case "kros":
      return isXml ? parseKrosXml(bytes) : csvToCanonical(decodeBytes(bytes));
    case "omega":
    case "idoklad":
      // Both ship CSV exports. Some Omega builds also emit XML — reuse KROS walker
      // since the tag names are near-identical.
      return isXml ? parseKrosXml(bytes) : csvToCanonical(decodeBytes(bytes));
  }
}

export function summarize(rows: CanonicalRow[]) {
  const invoiceNumbers = new Set<string>();
  const customers = new Set<string>();
  let totalValue = 0;
  const sample: Array<{ invoice_number: string; customer_name: string; total: number; issue_date: string }> = [];
  for (const r of rows) {
    if (r.invoice_number) invoiceNumbers.add(r.invoice_number);
    if (r.customer_name || r.customer_ico) customers.add((r.customer_ico ?? "") + "|" + (r.customer_name ?? ""));
    if (r.total && !isNaN(Number(r.total))) totalValue += Number(r.total);
  }
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.invoice_number || seen.has(r.invoice_number)) continue;
    seen.add(r.invoice_number);
    sample.push({
      invoice_number: r.invoice_number,
      customer_name: r.customer_name ?? "",
      total: Number(r.total ?? 0) || 0,
      issue_date: r.issue_date ?? "",
    });
    if (sample.length >= 5) break;
  }
  return {
    invoicesCount: invoiceNumbers.size,
    customersCount: customers.size,
    itemsCount: rows.length,
    totalValue,
    currency: "EUR",
    sampleInvoices: sample,
  };
}
