/*
  eFaktúra v cudzej mene: Peppol BIS (BT-6, BT-111) a § 26 zákona o DPH chcú
  daň aj v mene účtovania — v UBL TaxCurrencyCode a druhý TaxTotal bez rozpisu.
  Do 30. 10. 2026 ho náš generátor nepísal vôbec.
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

const firmaSk: any = {
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
// 100 USD + 23 % = 123 USD; kurz 1,0850 USD za 1 € → DPH 23 / 1,085 = 21,20 €.
const fakturaUsd: any = {
  invoice_number: "FA2026900",
  type: "regular",
  issue_date: "2026-10-12",
  due_date: "2026-10-26",
  delivery_date: "2026-10-12",
  currency: "USD",
  exchange_rate: 1.085,
  vat_total_eur: 21.2,
  variable_symbol: "2026900",
  customer_name: "Odberateľ s.r.o.",
  customer_ico: "43291067",
  customer_dic: "5843291067",
  customer_ic_dph: "SK5843291067",
  customer_street: "Dlhá 2",
  customer_city: "Košice",
  customer_zip: "04001",
  customer_country: "SK",
  subtotal: 100,
  vat_total: 23,
  total: 123,
};
const polozky: any[] = [
  { name: "Služba", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 23, subtotal: 100, vat_amount: 23, total: 123 },
];

describe("eFaktúra v cudzej mene", () => {
  it("nesie TaxCurrencyCode EUR a DPH v eurách z uložených súm", () => {
    const dto = mapToEN16931({ company: firmaSk, invoice: fakturaUsd, items: polozky });
    expect(dto.taxCurrency).toEqual({ code: "EUR", taxAmount: 21.2 });
    const xml = generatePeppolBisXml(dto).xml;
    expect(xml).toContain("<cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode>");
    expect(xml).toContain("<cbc:TaxCurrencyCode>EUR</cbc:TaxCurrencyCode>");
    expect(xml).toMatch(
      /<cac:TaxTotal>\s*<cbc:TaxAmount currencyID="EUR">21\.20<\/cbc:TaxAmount>\s*<\/cac:TaxTotal>/,
    );
    // Rozpis DPH ostáva len v mene faktúry.
    expect(xml.match(/<cac:TaxSubtotal>/g)?.length).toBe(1);
    expect(chybaXsd(UBL_INVOICE, xml)).toBeNull();
    const kontrola = skontrolujEfakturu(xml);
    expect(kontrola.nalezy.filter((n) => n.zavaznost === "chyba").map((n) => n.kod)).toEqual([]);
  });

  it("bez uložených súm prepočíta kurzom faktúry", () => {
    const dto = mapToEN16931({
      company: firmaSk,
      invoice: { ...fakturaUsd, vat_total_eur: null },
      items: polozky,
    });
    expect(dto.taxCurrency).toEqual({ code: "EUR", taxAmount: 21.2 });
  });

  it("faktúra v eurách TaxCurrencyCode nemá", () => {
    const dto = mapToEN16931({
      company: firmaSk,
      invoice: { ...fakturaUsd, currency: "EUR", exchange_rate: null, vat_total_eur: null },
      items: polozky,
    });
    expect(dto.taxCurrency).toBeUndefined();
    expect(generatePeppolBisXml(dto).xml).not.toContain("TaxCurrencyCode");
  });

  it("česká firma účtuje v korunách, faktúra v eurách nesie DPH v Kč", () => {
    const dto = mapToEN16931({
      company: { ...firmaSk, country: "CZ", ic_dph: "CZ25097563" },
      invoice: { ...fakturaUsd, currency: "EUR", exchange_rate: 24.5, vat_total_eur: 563.5 },
      items: polozky,
    });
    expect(dto.taxCurrency).toEqual({ code: "CZK", taxAmount: 563.5 });
  });

  it("dobropis v cudzej mene má DPH v eurách kladnú a prejde XSD", () => {
    const dto = mapToEN16931({
      company: firmaSk,
      invoice: {
        ...fakturaUsd,
        type: "credit_note",
        subtotal: -100,
        vat_total: -23,
        total: -123,
        vat_total_eur: -21.2,
      },
      items: polozky.map((p) => ({ ...p, quantity: -1, subtotal: -100, vat_amount: -23, total: -123 })),
      povodnaFaktura: { cislo: "FA2026900", vystavena: "2026-10-12" },
    });
    expect(dto.taxCurrency).toEqual({ code: "EUR", taxAmount: 21.2 });
    const xml = generatePeppolBisXml(dto).xml;
    expect(chybaXsd(UBL_CREDIT, xml)).toBeNull();
  });
});

describe("príjem eFaktúry v cudzej mene", () => {
  it("DPH v mene účtovania nezdvojí sumy dokladu", async () => {
    const { rozoberPrijatuUbl } = await import("./prijata-z-ubl");
    const xml = generatePeppolBisXml(
      mapToEN16931({ company: firmaSk, invoice: fakturaUsd, items: polozky }),
    ).xml;
    const r = rozoberPrijatuUbl(xml)!;
    expect(r.mena).toBe("USD");
    expect(r.zaklad).toBe(100);
    expect(r.dph).toBe(23);
    expect(r.celkom).toBe(123);
    expect(r.rozpis).toHaveLength(1);
  });
});
