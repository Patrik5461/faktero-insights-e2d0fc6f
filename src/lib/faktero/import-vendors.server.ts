// Server-side parsers that turn a vendor export (Money S3, Omega, iDoklad, KROS)
// into an array of canonical rows keyed by SuperFaktura's FieldKey names, so we
// can reuse the existing `runImport` pipeline with an identity mapping.
import { XMLParser } from "fast-xml-parser";
import type { FieldKey } from "./import-superfaktura.server";
import { parseCsv, detectMapping as detectMappingSpolocne } from "./import-superfaktura.server";
import { jeMPohodaJson, jePohodaXml, mpohodaNaRiadky, pohodaNaRiadky } from "./pohoda";
import { isdocNaRiadky, jeIsdoc } from "./isdoc";

export type VendorSource = "money-s3" | "omega" | "idoklad" | "kros" | "pohoda";
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
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
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
/** Vnorená hodnota — `hlbka(o, "Tel", "Cislo")`. `pickFirst` vnorené uzly preskakuje. */
function hlbka(o: any, ...cesta: string[]): string {
  let cur = o;
  for (const k of cesta) {
    if (cur == null || typeof cur !== "object") return "";
    const kluc = Object.keys(cur).find((x) => x.toLowerCase() === k.toLowerCase());
    if (kluc == null) return "";
    cur = cur[kluc];
    if (Array.isArray(cur)) cur = cur[0];
  }
  return cur == null || typeof cur === "object" ? "" : String(cur).trim();
}

/**
 * Money S3 nedáva jednu sumu bez DPH, ale rozpis po sadzbách:
 * `SouhrnDPH/Zaklad0`, `Zaklad5`, `Zaklad22`… a k nim `DPH5`, `DPH22`…
 * Základ dane je ich súčet.
 */
function souhrn(uzol: any, predpona: "Zaklad" | "DPH"): string {
  if (!uzol || typeof uzol !== "object") return "";
  let spolu = 0;
  let naslo = false;
  for (const [k, v] of Object.entries(uzol)) {
    if (typeof v === "object" || v == null) continue;
    // `Zaklad_MJ` je cena za mernú jednotku, nie súčtová položka.
    if (!k.toLowerCase().startsWith(predpona.toLowerCase()) || k.includes("_")) continue;
    if (predpona === "Zaklad" && k.toLowerCase().startsWith("zakladdph")) continue;
    const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) {
      spolu += n;
      naslo = true;
    }
  }
  return naslo ? String(Math.round((spolu + Number.EPSILON) * 100) / 100) : "";
}

/**
 * Money S3 (Seyfor). Štruktúra podľa oficiálnych vzorových súborov:
 * `MoneyData/SeznamFaktVyd/FaktVyd`, odberateľ v `DodOdb`, dátumy `Vystaveno`,
 * `Splatno`, `PlnenoDPH`, sumy v `SouhrnDPH` a `Celkem`.
 *
 * Pri faktúre v cudzej mene sú v `Celkem` domáce koruny a skutočné sumy v
 * `Valuty`. Brať `Celkem` s menou z `Valuty` by faktúru nafúklo kurzom.
 */
function parseMoneyS3(bytes: Uint8Array): CanonicalRow[] {
  const xml = decodeBytes(bytes);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    trimValues: true,
    // Bez tohto sa IČO `01572377` prevedie na číslo a stratí vedúcu nulu.
    parseTagValue: false,
    parseAttributeValue: false,
  });
  const obj = parser.parse(xml);
  const root = obj?.MoneyData ?? obj?.moneydata ?? obj;

  const invoices = [
    ...asArray(root?.SeznamFaktVyd?.FaktVyd),
    ...asArray(root?.SeznamFaktPrij?.FaktPrij),
    ...asArray(root?.Faktury?.Faktura),
  ];
  const rows: CanonicalRow[] = [];

  for (const inv of invoices) {
    // Odberateľ je `DodOdb`; `MojeFirma` je vlastná firma a do importu nepatrí.
    const partner = inv.DodOdb ?? inv.KonecPrij ?? inv.Firma ?? inv.Odberatel ?? {};
    const adresa = partner.Adresa ?? partner.ObchAdresa ?? partner.FaktAdresa ?? partner;

    const valuty = inv.Valuty;
    const cudziaMena = pickFirst(valuty?.Mena ?? {}, "Kod");
    const suctyUzol = cudziaMena ? (valuty?.SouhrnDPH ?? inv.SouhrnDPH) : inv.SouhrnDPH;
    const celkom = cudziaMena
      ? pickFirst(valuty, "Celkem") || pickFirst(inv, "Celkem")
      : pickFirst(inv, "Celkem");

    const head: CanonicalRow = {
      invoice_number: pickFirst(inv, "Doklad", "Cislo", "CisloDokladu", "Number"),
      variable_symbol: pickFirst(inv, "VarSymbol", "VarSym", "VariabilniSymbol"),
      issue_date: normalizeDate(pickFirst(inv, "Vystaveno", "DatVyst", "DatumVystaveni")),
      due_date: normalizeDate(pickFirst(inv, "Splatno", "DatSplat", "DatumSplatnosti")),
      delivery_date: normalizeDate(
        pickFirst(inv, "PlnenoDPH", "DatSkPoh", "DatPln", "DatumPlneni", "DatumDodani"),
      ),
      currency: cudziaMena || hlbka(inv, "MojeFirma", "MenaKod") || "EUR",
      subtotal: num(souhrn(suctyUzol, "Zaklad")),
      vat_total: num(souhrn(suctyUzol, "DPH")),
      total: num(celkom),
      notes: pickFirst(inv, "Popis", "TextPredKonc", "Poznamka", "TextPred"),
      external_id: pickFirst(inv, "GUID", "ID"),
      customer_name: pickFirst(partner, "ObchNazev", "FaktNazev", "Nazev", "Name"),
      customer_ico: pickFirst(partner, "ICO", "IC"),
      // Money S3 vedie len `DIC` v tvare `CZ12345678` — to je zároveň IČ DPH.
      customer_dic: pickFirst(partner, "DIC").replace(/^[A-Z]{2}/i, ""),
      customer_ic_dph: pickFirst(partner, "ICDPH", "IcDph") || pickFirst(partner, "DIC"),
      customer_email: pickFirst(partner, "EMail", "Email"),
      customer_phone: hlbka(partner, "Tel", "Cislo") || pickFirst(partner, "Tel", "Telefon"),
      customer_street: pickFirst(adresa, "Ulice", "Ulica", "Street"),
      // V Money S3 sa mesto volá `Misto`.
      customer_city: pickFirst(adresa, "Misto", "Mesto", "City"),
      customer_zip: pickFirst(adresa, "PSC", "Zip"),
      // Kód krajiny je len v `ObchAdresa`/`FaktAdresa`; `Adresa` má celý názov.
      customer_country:
        pickFirst(adresa, "KodStatu") ||
        pickFirst(partner.ObchAdresa ?? {}, "KodStatu") ||
        pickFirst(partner.FaktAdresa ?? {}, "KodStatu") ||
        pickFirst(adresa, "Stat", "Country") ||
        "SK",
    };

    const items = asArray(inv.SeznamPolozek?.Polozka ?? inv.Polozky?.Polozka ?? inv.Item);
    if (items.length === 0) {
      rows.push(head);
      continue;
    }
    for (const it of items) {
      const suctyPol = cudziaMena ? (it.SouhrnDPH?.Valuty ?? it.SouhrnDPH) : it.SouhrnDPH;
      const zaklad = pickFirst(suctyPol ?? {}, "Zaklad");
      const dan = pickFirst(suctyPol ?? {}, "DPH");
      const spolu =
        zaklad || dan
          ? String(
              Math.round(
                (Number(num(zaklad) || 0) + Number(num(dan) || 0) + Number.EPSILON) * 100,
              ) / 100,
            )
          : "";
      rows.push({
        ...head,
        item_name: pickFirst(it, "Popis", "Nazev", "Name"),
        item_quantity: num(pickFirst(it, "PocetMJ", "PocetMj", "Mnozstvo", "Quantity")),
        item_unit:
          hlbka(it, "SklPolozka", "KmKarta", "MJ") || pickFirst(it, "Jednotka", "MJ", "Unit") || "ks",
        item_unit_price: num(
          cudziaMena
            ? pickFirst(it, "Valuty") || pickFirst(it, "Cena")
            : pickFirst(it, "Cena", "CenaMj", "UnitPrice"),
        ),
        item_vat_rate: num(pickFirst(it, "SazbaDPH", "SazbaDph", "DphSaz", "VatRate")),
        item_total: spolu,
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
/*
 * Rozpoznanie stĺpcov CSV používa **ten istý detektor ako import zo
 * SuperFaktúry**. Tento súbor mal vlastný, jednoduchší: hľadal synonymum ako
 * podreťazec v hlavičke a nemal riešenie konfliktov, takže „dph" sa chytilo na
 * stĺpec „IČ DPH", „id" na „Identifikačné číslo" a jeden stĺpec mohol skončiť
 * v dvoch poliach naraz. Dva detektory znamenali aj to, že oprava jedného sa
 * druhého netýkala.
 */
function csvToCanonical(text: string): CanonicalRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const map = detectMappingSpolocne(headers, rows).mapping;
  return rows.map((r) => {
    const out: CanonicalRow = {};
    for (const [field, header] of Object.entries(map) as [FieldKey, string][]) {
      const v = r[header];
      if (v == null || v === "") continue;
      if (field === "issue_date" || field === "due_date" || field === "delivery_date")
        out[field] = normalizeDate(v);
      else if (field.match(/subtotal|vat_total|total|item_(quantity|unit_price|vat_rate|total)/))
        out[field] = num(v);
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
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    trimValues: true,
    // Bez tohto stráca IČO vedúce nuly (00151653 → 151653).
    parseTagValue: false,
    parseAttributeValue: false,
    removeNSPrefix: true,
  });
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
    if (items.length === 0) {
      rows.push(head);
      continue;
    }
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

/**
 * Pohoda a mPohoda. Nie sú to rovnaké formáty — Pohoda vyváža XML (`dataPack`
 * alebo `responsePack`, prípadne ISDOC), mPohoda ako cloudová aplikácia vydáva
 * JSON cez svoje rozhranie. Jedna stránka importu, formát sa rozpozná z obsahu.
 */
function parsePohoda(bytes: Uint8Array): CanonicalRow[] {
  const obsah = decodeBytes(bytes);

  if (jeMPohodaJson(obsah)) {
    try {
      return mpohodaNaRiadky(JSON.parse(obsah)) as CanonicalRow[];
    } catch {
      return [];
    }
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    trimValues: true,
    removeNSPrefix: true,
    // Bez tohto stráca IČO vedúce nuly.
    parseTagValue: false,
    parseAttributeValue: false,
  });

  // Pohoda vie faktúru vyviezť aj do ISDOC.
  if (jeIsdoc(obsah)) return isdocNaRiadky(parser.parse(obsah)) as CanonicalRow[];
  if (jePohodaXml(obsah)) return pohodaNaRiadky(parser.parse(obsah)) as CanonicalRow[];
  return [];
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
export function parseVendorFile(
  source: VendorSource,
  fileName: string,
  bytes: Uint8Array,
): CanonicalRow[] {
  const lower = fileName.toLowerCase();
  const isXml = lower.endsWith(".xml");
  switch (source) {
    case "pohoda":
      return parsePohoda(bytes);
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
  const sample: Array<{
    invoice_number: string;
    customer_name: string;
    total: number;
    issue_date: string;
  }> = [];
  /*
   * Celková suma sa počíta **raz na faktúru**, nie za každý riadok. Riadok je
   * položka a hlavičkové `total` sa na nich opakuje — faktúra s tromi
   * položkami sa predtým do náhľadu započítala trikrát.
   */
  let mena = "";
  for (const r of rows) {
    if (r.invoice_number && !invoiceNumbers.has(r.invoice_number)) {
      invoiceNumbers.add(r.invoice_number);
      if (r.total && !isNaN(Number(r.total))) totalValue += Number(r.total);
    }
    if (r.customer_name || r.customer_ico)
      customers.add((r.customer_ico ?? "") + "|" + (r.customer_name ?? ""));
    if (!mena && r.currency) mena = r.currency;
  }
  totalValue = Math.round((totalValue + Number.EPSILON) * 100) / 100;
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
    currency: mena || "EUR",
    sampleInvoices: sample,
  };
}
