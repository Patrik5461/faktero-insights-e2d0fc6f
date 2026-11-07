/*
  Zľava na položke v eFaktúre (Peppol BIS 3): čistá cena po zľave v
  Price/PriceAmount, hrubá cena a zľava na jednotku v Price/AllowanceCharge.
  Predtým išla hrubá cena a LineExtensionAmount po zľave — PEPPOL-EN16931-R120
  (audit 2. kolo, 7. 11. 2026; Tobify 2026036 so zľavou 20 %).
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { mapToEN16931 } from "./en16931.server";
import { generatePeppolBisXml } from "./xml.server";
import { skontrolujEfakturu } from "./kontrola";

xmlRegisterFsInputProviders();
function validator(cesta: string) {
  const url = new URL(cesta, import.meta.url);
  return XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
}
const UBL_INVOICE = validator("../schemy/ubl-2.1/maindoc/UBL-Invoice-2.1.xsd");
const UBL_CREDIT = validator("../schemy/ubl-2.1/maindoc/UBL-CreditNote-2.1.xsd");
function chybaXsd(v: XsdValidator, xml: string): string | null {
  const doc = XmlDocument.fromString(xml);
  try {
    v.validate(doc);
    return null;
  } catch (e) {
    return String((e as Error).message);
  } finally {
    doc.dispose();
  }
}

const firma: any = {
  name: "Dodávateľ s.r.o.",
  ico: "86179504",
  dic: "4286179504",
  ic_dph: "SK4286179504",
  street: "Hlavná 1",
  city: "Bratislava",
  zip: "81101",
  country: "SK",
  iban: "SK3112000000198742637541",
  vat_payer: true,
};
const hlavicka = (o: any = {}): any => ({
  invoice_number: "2026036",
  type: "regular",
  issue_date: "2026-10-12",
  due_date: "2026-10-26",
  delivery_date: "2026-10-12",
  currency: "EUR",
  variable_symbol: "2026036",
  customer_name: "Odberateľ s.r.o.",
  customer_ico: "43291067",
  customer_dic: "5843291067",
  customer_ic_dph: "SK5843291067",
  customer_street: "Dlhá 2",
  customer_city: "Košice",
  customer_zip: "04001",
  customer_country: "SK",
  ...o,
});
const riadok = (q: number, cena: number, pct: number, sadzba = 23, poz = 1): any => {
  const zaklad = Math.round(q * cena * (1 - pct / 100) * 100) / 100;
  const dph = Math.round(zaklad * sadzba) / 100;
  return {
    position: poz,
    name: `Položka ${poz}`,
    quantity: q,
    unit: "ks",
    unit_price: cena,
    discount_percent: pct,
    vat_rate: sadzba,
    subtotal: zaklad,
    vat_amount: dph,
    total: Math.round((zaklad + dph) * 100) / 100,
  };
};
const sucty = (items: any[], znamienko = 1) => {
  const s = items.reduce((a, r) => a + r.subtotal, 0);
  const d = items.reduce((a, r) => a + r.vat_amount, 0);
  return {
    subtotal: znamienko * Math.round(s * 100) / 100,
    vat_total: znamienko * Math.round(d * 100) / 100,
    total: znamienko * Math.round((s + d) * 100) / 100,
  };
};
const chyby = (xml: string) =>
  skontrolujEfakturu(xml)
    .nalezy.filter((n) => n.zavaznost === "chyba")
    .map((n) => n.kod);

describe("eFaktúra so zľavou na položke", () => {
  it("Tobify 2026036: čistá cena + Price/AllowanceCharge, prejde pravidlami aj XSD", () => {
    const items = [riadok(1, 350, 0, 0, 1), riadok(1, 1300, 20, 0, 2)];
    const inv = hlavicka({ ...sucty(items), vat_total: 0, total: 1390 });
    const xml = generatePeppolBisXml(
      mapToEN16931({ company: { ...firma, vat_payer: false, ic_dph: null }, invoice: inv, items }),
    ).xml;
    expect(xml).toContain('<cbc:PriceAmount currencyID="EUR">1040.00</cbc:PriceAmount>');
    expect(xml).toMatch(
      /<cac:AllowanceCharge>\s*<cbc:ChargeIndicator>false<\/cbc:ChargeIndicator>\s*<cbc:Amount currencyID="EUR">260.00<\/cbc:Amount>\s*<cbc:BaseAmount currencyID="EUR">1300.00<\/cbc:BaseAmount>/,
    );
    // Riadok bez zľavy zľavu nemá.
    expect(xml.match(/<cac:AllowanceCharge>/g)).toHaveLength(1);
    expect(chyby(xml)).toEqual([]);
    expect(chybaXsd(UBL_INVOICE, xml)).toBeNull();
  });

  it("zaokrúhlenie: 3 × 8,35 − 13 % a 10 × 0,14 − 13 % (Test NK20260021), Tobify 2026002", () => {
    const items = [riadok(3, 8.35, 13, 23, 1), riadok(10, 0.14, 13, 23, 2), riadok(1, 359, 10, 23, 3), riadok(7, 33.33, 15, 5, 4)];
    const xml = generatePeppolBisXml(
      mapToEN16931({ company: firma, invoice: hlavicka(sucty(items)), items }),
    ).xml;
    expect(xml).toContain('<cbc:PriceAmount currencyID="EUR">7.2633</cbc:PriceAmount>');
    expect(chyby(xml)).toEqual([]);
    expect(chybaXsd(UBL_INVOICE, xml)).toBeNull();
  });

  it("so zľavou na položke aj na doklade", () => {
    const items = [riadok(3, 8.35, 13, 23, 1), riadok(2, 99.99, 0, 23, 2)];
    const s = sucty(items);
    const zlava = 12.34;
    const k = (s.subtotal - zlava) / s.subtotal;
    const dph = Math.round(s.vat_total * k * 100) / 100;
    const inv = hlavicka({ discount_total: zlava, subtotal: s.subtotal - zlava, vat_total: dph, total: Math.round((s.subtotal - zlava + dph) * 100) / 100 });
    const xml = generatePeppolBisXml(mapToEN16931({ company: firma, invoice: inv, items })).xml;
    expect(chyby(xml)).toEqual([]);
    expect(chybaXsd(UBL_INVOICE, xml)).toBeNull();
  });

  it("dobropis (CreditNote) so zľavou: kladné sumy, pravidlá aj XSD", () => {
    const items = [riadok(-3, 8.35, 13, 23, 1), riadok(-1, 1300, 20, 23, 2)];
    const inv = hlavicka({ invoice_number: "D2026001", type: "credit_note", ...sucty(items) });
    const xml = generatePeppolBisXml(
      mapToEN16931({ company: firma, invoice: inv, items, povodnaFaktura: { cislo: "2026036", vystavena: "2026-10-01" } }),
    ).xml;
    expect(xml).toContain("<cac:CreditNoteLine>");
    expect(xml).toContain('<cbc:BaseAmount currencyID="EUR">1300.00</cbc:BaseAmount>');
    expect(xml).not.toMatch(/>-\d/);
    expect(chyby(xml)).toEqual([]);
    expect(chybaXsd(UBL_CREDIT, xml)).toBeNull();
  });

  it("pred opravou by to R120 zachytilo (hrubá cena pri sume po zľave)", () => {
    const items = [riadok(1, 1300, 20, 23, 1)];
    const xml = generatePeppolBisXml(mapToEN16931({ company: firma, invoice: hlavicka(sucty(items)), items }))
      .xml.replace(/<cac:AllowanceCharge>[\s\S]*?<\/cac:AllowanceCharge>/, "")
      .replace(">1040.00</cbc:PriceAmount>", ">1300.00</cbc:PriceAmount>");
    expect(chyby(xml)).toContain("PEPPOL-EN16931-R120");
  });
});
