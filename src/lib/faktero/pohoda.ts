/**
 * Pohoda a mPohoda — čítanie exportov.
 *
 * **Nie sú to rovnaké formáty.** Pohoda (Stormware) vyváža XML: dokladový balík
 * `dataPack` pri importe a `responsePack` pri exporte z programu. mPohoda je
 * cloudová aplikácia toho istého výrobcu, ale pracuje cez rozhranie REST a
 * dáta vydáva ako **JSON**. Preto sú tu dva prevodníky a jedna stránka importu,
 * ktorá si formát rozpozná sama.
 *
 * Pohoda vie doklad vyviezť aj do ISDOC — ten číta `isdoc.ts`.
 *
 * Výstupom sú riadky, kde jeden riadok je jedna položka faktúry a hlavička sa
 * na nich opakuje; tak ich zvyšok importu zoskupuje do faktúr.
 */

export type PohodaRiadok = Record<string, string>;

/** Sadzby DPH pre kódy, ktoré neuvádzajú percento. Slovenské sadzby 2025. */
const SADZBY: Record<string, number> = {
  none: 0,
  zerovatrate: 0,
  third: 5,
  secondreducedvatrate: 5,
  low: 19,
  firstreducedvatrate: 19,
  high: 23,
  historyhigh: 23,
  basicvatrate: 23,
};

function cislo(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const t = (v as any)["#text"];
    return t == null ? "" : String(t).trim();
  }
  return String(v).trim();
}

function uzol(o: any, ...cesta: string[]): any {
  let cur = o;
  for (const k of cesta) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = Array.isArray(cur) ? cur[0]?.[k] : cur[k];
  }
  return cur;
}

function hodnota(o: any, ...cesta: string[]): string {
  return text(uzol(o, ...cesta));
}

function pole(v: any): any[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function suma(n: number): string {
  return n === 0 ? "" : String(Math.round((n + Number.EPSILON) * 100) / 100);
}

/** `2025-03-04` alebo `4.3.2025` → `2025-03-04`. */
function datum(v: string): string {
  const s = (v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s;
}

/* ---------------- Pohoda XML ---------------- */

export function jePohodaXml(xml: string): boolean {
  if (!xml) return false;
  const z = xml.slice(0, 3000);
  return (
    /stormware\.cz\/schema/i.test(z) ||
    /<(dat:)?(dataPack|responsePack)[\s>]/i.test(z)
  );
}

/**
 * Sadzba položky. Kód `rateVAT` hovorí len o priehradke, nie o percente, a
 * percentá sa v čase menili. Ak sa dá, odvodí sa zo súm — to je pravdivé aj
 * pre staršie doklady.
 */
function sadzbaPolozky(kod: string, zaklad: number, dan: number): number {
  if (zaklad > 0 && dan > 0) return Math.round((dan / zaklad) * 100);
  return SADZBY[(kod ?? "").toLowerCase()] ?? 0;
}

export function pohodaNaRiadky(doc: any): PohodaRiadok[] {
  const balik = doc?.dataPack ?? doc?.responsePack ?? doc;
  const polozkyBalika = [
    ...pole(uzol(balik, "dataPackItem")),
    ...pole(uzol(balik, "responsePackItem")),
  ];
  const kandidati = polozkyBalika.length ? polozkyBalika : pole(balik);

  const riadky: PohodaRiadok[] = [];
  for (const item of kandidati) {
    const faktura = uzol(item, "invoice") ?? (uzol(item, "invoiceHeader") ? item : null);
    if (!faktura) continue;

    const h = uzol(faktura, "invoiceHeader") ?? {};
    const adresa = uzol(h, "partnerIdentity", "address") ?? {};
    const suhrn = uzol(faktura, "invoiceSummary", "homeCurrency") ?? {};

    const zaklady =
      cislo(hodnota(suhrn, "priceNone")) +
      cislo(hodnota(suhrn, "priceLow")) +
      cislo(hodnota(suhrn, "priceHigh")) +
      cislo(hodnota(suhrn, "price3"));
    const dane =
      cislo(hodnota(suhrn, "priceLowVAT")) +
      cislo(hodnota(suhrn, "priceHighVAT")) +
      cislo(hodnota(suhrn, "price3VAT"));
    const zaokruhlenie = cislo(hodnota(suhrn, "round", "priceRound"));

    const typ = hodnota(h, "invoiceType").toLowerCase();
    const cisloDokladu =
      hodnota(h, "number", "numberRequested") || hodnota(h, "number", "id") || hodnota(h, "id");

    const hlavicka: PohodaRiadok = {
      invoice_number: cisloDokladu,
      variable_symbol: hodnota(h, "symVar"),
      issue_date: datum(hodnota(h, "date")),
      // `dateTax` je dátum zdaniteľného plnenia — u nás dátum dodania.
      delivery_date: datum(hodnota(h, "dateTax")),
      due_date: datum(hodnota(h, "dateDue")),
      notes: hodnota(h, "text"),
      external_id: hodnota(h, "id") || hodnota(h, "extId", "ids"),
      document_type: typ.includes("creditnotice") ? "credit_note" : "regular",
      subtotal: suma(zaklady),
      vat_total: suma(dane),
      total: suma(zaklady + dane + zaokruhlenie),
      customer_name: hodnota(adresa, "company") || hodnota(adresa, "name"),
      customer_ico: hodnota(adresa, "ico"),
      customer_dic: hodnota(adresa, "dic"),
      customer_ic_dph: hodnota(adresa, "icDph") || hodnota(adresa, "vatId"),
      customer_street: hodnota(adresa, "street"),
      customer_city: hodnota(adresa, "city"),
      customer_zip: hodnota(adresa, "zip"),
      customer_country: hodnota(adresa, "country", "ids") || hodnota(adresa, "country"),
      customer_email: hodnota(adresa, "email"),
      customer_phone: hodnota(adresa, "phone") || hodnota(adresa, "mobilPhone"),
    };

    const polozky = pole(uzol(faktura, "invoiceDetail", "invoiceItem"));
    if (!polozky.length) {
      if (hlavicka.invoice_number || hlavicka.customer_name) riadky.push(hlavicka);
      continue;
    }

    for (const p of polozky) {
      const mena = uzol(p, "homeCurrency") ?? {};
      const zaklad = cislo(hodnota(mena, "price"));
      const dan = cislo(hodnota(mena, "priceVAT"));
      riadky.push({
        ...hlavicka,
        item_name: hodnota(p, "text"),
        item_quantity: hodnota(p, "quantity") || "1",
        item_unit: hodnota(p, "unit") || "ks",
        item_unit_price: hodnota(mena, "unitPrice"),
        item_vat_rate: String(sadzbaPolozky(hodnota(p, "rateVAT"), zaklad, dan)),
        item_total: suma(cislo(hodnota(mena, "priceSum")) || zaklad + dan),
        item_sku: hodnota(p, "code"),
      });
    }
  }
  return riadky;
}

/* ---------------- mPohoda JSON ---------------- */

export function jeMPohodaJson(t: string): boolean {
  if (!t) return false;
  const z = t.slice(0, 4000);
  if (!/^[\s﻿]*[[{]/.test(z)) return false;
  return /"DocumentNumber"|"BusinessPartnerAddress"|"DocumentRecapitulation"/.test(z);
}

/** Vyzerá objekt na faktúru, nie na jej položku? */
function jeFaktura(x: any): boolean {
  return (
    !!x &&
    typeof x === "object" &&
    (x.DocumentNumber != null || x.BusinessPartnerAddress != null || x.VariableSymbol != null)
  );
}

/**
 * Rozhranie mPohody vracia zoznam buď priamo, alebo v obale `Items`/`Data`.
 *
 * Pozor: **samotná faktúra má tiež pole `Items`** — svoje položky. Bez kontroly,
 * či prvky vyzerajú na faktúru, by sa z jedinej faktúry stali „faktúry" z jej
 * riadkov a doklad by sa stratil.
 */
function zoznamFaktur(json: any): any[] {
  if (Array.isArray(json)) return json;
  if (jeFaktura(json)) return [json];
  for (const k of ["Items", "Data", "items", "data", "value"]) {
    const v = json?.[k];
    if (Array.isArray(v) && v.some(jeFaktura)) return v;
    if (v && typeof v === "object" && Array.isArray(v.Items) && v.Items.some(jeFaktura))
      return v.Items;
  }
  return [];
}

export function mpohodaNaRiadky(json: any): PohodaRiadok[] {
  const riadky: PohodaRiadok[] = [];
  for (const f of zoznamFaktur(json)) {
    if (!f || typeof f !== "object") continue;
    const a = f.BusinessPartnerAddress ?? {};
    const rekapitulacia = f.DocumentRecapitulation ?? {};

    const polozky = Array.isArray(f.Items) ? f.Items : [];
    const zaklad = polozky.reduce((s: number, p: any) => s + cislo(p.PriceWithoutVat), 0);
    const dan = polozky.reduce((s: number, p: any) => s + cislo(p.Vat), 0);
    const celkom = cislo(rekapitulacia.TotalPrice) || zaklad + dan;

    const hlavicka: PohodaRiadok = {
      invoice_number: String(f.DocumentNumber ?? ""),
      variable_symbol: String(f.VariableSymbol ?? ""),
      issue_date: datum(String(f.IssueDate ?? "")),
      due_date: datum(String(f.DueDate ?? "")),
      // V mPohode je `TaxDate` dátum zdaniteľného plnenia.
      delivery_date: datum(String(f.TaxDate ?? "")),
      currency: String(f.CurrencyId ?? "") || "EUR",
      notes: String(f.Text ?? f.Note ?? ""),
      external_id: String(f.Id ?? ""),
      subtotal: suma(zaklad),
      vat_total: suma(dan),
      total: suma(celkom),
      customer_name: String(a.CompanyName ?? a.Name ?? ""),
      customer_ico: String(a.IdentificationNumber ?? ""),
      customer_dic: String(a.TaxIdentificationNumber ?? ""),
      customer_ic_dph: String(a.VatIdentificationNumber ?? ""),
      customer_street: String(a.Street ?? ""),
      customer_city: String(a.City ?? ""),
      customer_zip: String(a.PostCode ?? ""),
      customer_country: String(a.Country ?? ""),
      customer_email: String(a.Email ?? ""),
      customer_phone: String(a.PhoneNumber ?? a.MobilePhoneNumber ?? ""),
    };

    if (!polozky.length) {
      if (hlavicka.invoice_number || hlavicka.customer_name) riadky.push(hlavicka);
      continue;
    }

    for (const p of polozky) {
      const zakladP = cislo(p.PriceWithoutVat);
      const danP = cislo(p.Vat);
      riadky.push({
        ...hlavicka,
        item_name: String(p.Text ?? ""),
        item_quantity: String(p.Quantity ?? 1),
        item_unit: String(p.Unit ?? "ks"),
        item_unit_price: String(cislo(p.UnitPrice)),
        // `VatRateType` je len druh sadzby (základná, znížená…), nie percento —
        // to sa spoľahlivejšie odvodí zo súm položky.
        item_vat_rate: String(sadzbaPolozky(String(p.VatRateType ?? ""), zakladP, danP)),
        item_total: suma(cislo(p.PriceWithVat) || zakladP + danP),
        item_sku: String(p.Code ?? ""),
      });
    }
  }
  return riadky;
}
