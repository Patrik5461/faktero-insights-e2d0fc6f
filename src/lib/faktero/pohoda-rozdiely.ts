/*
  Rozdiely oproti Pohode — porovnanie odoslaného XML s tým, čo by z dokladu
  odišlo dnes (postup z auditu 22. 10. 2026, `a_vystavene.mts`).

  Porovnávajú sa účtovne podstatné polia jedného `dataPackItem` (hlavička,
  partner, súhrn po sadzbách, súčty položiek a ich kódy). Dátum zaúčtovania
  sa vynecháva — mení sa so zámkom obdobia, nie s dokladom.
*/

import { holeIdDokladu } from "./pohoda-kontrola";

const v = (s: string, re: RegExp) => re.exec(s)?.[1]?.trim() ?? "";

/** Kľúčové polia každého `dataPackItem` v súbore podľa jeho `id`. */
export function poliaDokladovXml(xml: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const m of String(xml ?? "").matchAll(
    /<dat:dataPackItem\b([^>]*)>([\s\S]*?)<\/dat:dataPackItem>/g,
  )) {
    // Oprava ide pod `id-verzia` — porovnáva sa podľa holého id dokladu.
    const id = holeIdDokladu(/\bid="([^"]*)"/.exec(m[1])?.[1] ?? "?");
    out[id] = poliaDokladu(m[2]);
  }
  return out;
}

const HLAVICKA =
  /<(\w+):(?:invoiceHeader|voucherHeader|intDocHeader)>([\s\S]*?)<\/\1:(?:invoiceHeader|voucherHeader|intDocHeader)>/;

/** Polia jedného dokladu (vnútro `dataPackItem`). */
export function poliaDokladu(x: string): Record<string, string> {
  const r: Record<string, string> = {};
  const hdr = HLAVICKA.exec(x)?.[2] ?? x;
  r.typ = v(hdr, /<\w+:(?:invoiceType|voucherType)>([^<]*)</);
  r.cislo = v(hdr, /<\w+:number>\s*<typ:numberRequested[^>]*>([^<]*)</);
  for (const t of [
    "originalDocument",
    "originalDocumentNumber",
    "symVar",
    "date",
    "dateTax",
    "dateKHDPH",
    "dateDue",
    "dateDelivery",
    "text",
  ]) {
    r[t] = v(hdr, new RegExp(`<\\w+:${t}>([^<]*)</\\w+:${t}>`));
  }
  r.accounting = v(hdr, /<\w+:accounting>\s*<typ:ids>([^<]*)</);
  r.classificationVAT = v(hdr, /<\w+:classificationVAT>\s*<typ:ids>([^<]*)</);
  r.classificationKVDPH = v(hdr, /<\w+:classificationKVDPH>\s*<typ:ids>([^<]*)</);
  const p = v(hdr, /<\w+:partnerIdentity>([\s\S]*?)<\/\w+:partnerIdentity>/);
  for (const t of ["company", "ico", "dic", "icDph", "street", "city", "zip"])
    r["partner." + t] = v(p, new RegExp(`<typ:${t}>([^<]*)</typ:${t}>`));
  r["partner.country"] = v(p, /<typ:country>\s*<typ:ids>([^<]*)</);
  r.paymentType = v(hdr, /<typ:paymentType>([^<]*)</);
  const sum = v(
    x,
    /<\w+:(?:invoiceSummary|voucherSummary|intDocSummary)>([\s\S]*?)<\/\w+:(?:invoiceSummary|voucherSummary|intDocSummary)>/,
  );
  const home = v(sum, /<\w+:homeCurrency>([\s\S]*?)<\/\w+:homeCurrency>/);
  for (const t of [
    "priceNone",
    "price3",
    "price3VAT",
    "priceLow",
    "priceLowVAT",
    "priceHigh",
    "priceHighVAT",
    "priceRound",
  ])
    r["sum." + t] = v(home, new RegExp(`<typ:${t}>([^<]*)</typ:${t}>`));
  const fc = v(sum, /<\w+:foreignCurrency>([\s\S]*?)<\/\w+:foreignCurrency>/);
  r["fc.currency"] = v(fc, /<typ:currency>\s*<typ:ids>([^<]*)</);
  r["fc.rate"] = v(fc, /<typ:rate>([^<]*)</);
  r["fc.priceSum"] = v(fc, /<typ:priceSum>([^<]*)</);
  const det = v(
    x,
    /<\w+:(?:invoiceDetail|voucherDetail|intDocDetail)>([\s\S]*?)<\/\w+:(?:invoiceDetail|voucherDetail|intDocDetail)>/,
  );
  const items = [
    ...det.matchAll(
      /<\w+:(?:invoiceItem|voucherItem|intDocItem|invoiceAdvancePaymentItem)>([\s\S]*?)<\/\w+:(?:invoiceItem|voucherItem|intDocItem|invoiceAdvancePaymentItem)>/g,
    ),
  ].map((m) => m[1]);
  let cena = 0;
  let dph = 0;
  const sadzby: string[] = [];
  for (const it of items) {
    const h = v(
      it,
      /<\w+:(?:homeCurrency|foreignCurrency)>([\s\S]*?)<\/\w+:(?:homeCurrency|foreignCurrency)>/,
    );
    cena += Number(v(h, /<typ:price>([^<]*)</) || 0);
    dph += Number(v(h, /<typ:priceVAT>([^<]*)</) || 0);
    sadzby.push(v(it, /<\w+:rateVAT>([^<]*)</));
  }
  r["polozky.pocet"] = String(items.length);
  r["polozky.cena"] = cena.toFixed(2);
  r["polozky.dph"] = dph.toFixed(2);
  r["polozky.sadzby"] = sadzby.join(",");
  r["polozky.clenenie"] = [...det.matchAll(/<\w+:classificationVAT>\s*<typ:ids>([^<]*)</g)]
    .map((m) => m[1])
    .join(",");
  r["polozky.kv"] = [...det.matchAll(/<\w+:classificationKVDPH>\s*<typ:ids>([^<]*)</g)]
    .map((m) => m[1])
    .join(",");
  r["polozky.predkontacia"] = [...det.matchAll(/<\w+:accounting>\s*<typ:ids>([^<]*)</g)]
    .map((m) => m[1])
    .join(",");
  return r;
}

export type RozdielPola = { pole: string; vPohode: string; teraz: string };

/**
 * Polia, ktoré sa neporovnávajú: text dokladu generátor časom zlepšil (prázdny
 * → text nad položkami) a účtovne nič nemení — inak by sa ukazovali ako
 * zmenené doklady, ktoré nikto neupravil.
 */
export const NEPOROVNAVANE_POLIA = new Set(["text"]);

/** Polia, v ktorých sa odoslaná a dnešná podoba dokladu líšia. */
export function rozdielyPoli(
  odoslane: Record<string, string>,
  teraz: Record<string, string>,
): RozdielPola[] {
  const out: RozdielPola[] = [];
  for (const k of new Set([...Object.keys(odoslane), ...Object.keys(teraz)])) {
    if (NEPOROVNAVANE_POLIA.has(k)) continue;
    const a = odoslane[k] ?? "";
    const b = teraz[k] ?? "";
    if (a !== b) out.push({ pole: k, vPohode: a, teraz: b });
  }
  return out;
}

/** Názvy polí do rozhrania (kľúče prekladu). */
export const NAZVY_POLI: Record<string, string> = {
  typ: "Typ dokladu",
  cislo: "Číslo",
  originalDocument: "Číslo dodávateľa",
  originalDocumentNumber: "Pôvodné číslo dokladu",
  symVar: "VS",
  date: "Dátum vystavenia",
  dateTax: "Dátum DPH",
  dateKHDPH: "Dátum KH DPH",
  dateDue: "Splatnosť",
  dateDelivery: "Dátum dodania",
  text: "Text",
  accounting: "Predkontácia",
  classificationVAT: "Členenie DPH",
  classificationKVDPH: "Členenie KV DPH",
  "partner.company": "Partner",
  "partner.ico": "IČO",
  "partner.dic": "DIČ",
  "partner.icDph": "IČ DPH",
  "partner.street": "Ulica",
  "partner.city": "Mesto",
  "partner.zip": "PSČ",
  "partner.country": "Krajina",
  paymentType: "Forma úhrady",
  "sum.priceNone": "Základ 0 %",
  "sum.price3": "Základ 2. znížená",
  "sum.price3VAT": "DPH 2. znížená",
  "sum.priceLow": "Základ znížená",
  "sum.priceLowVAT": "DPH znížená",
  "sum.priceHigh": "Základ základná",
  "sum.priceHighVAT": "DPH základná",
  "sum.priceRound": "Zaokrúhlenie",
  "fc.currency": "Mena",
  "fc.rate": "Kurz",
  "fc.priceSum": "Spolu v mene",
  "polozky.pocet": "Počet položiek",
  "polozky.cena": "Položky — základ",
  "polozky.dph": "Položky — DPH",
  "polozky.sadzby": "Položky — sadzby",
  "polozky.clenenie": "Položky — členenie DPH",
  "polozky.kv": "Položky — KV DPH",
  "polozky.predkontacia": "Položky — predkontácia",
};
