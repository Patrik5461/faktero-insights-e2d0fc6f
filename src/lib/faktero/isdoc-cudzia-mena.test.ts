import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { XMLParser } from "fast-xml-parser";
import { buildIsdoc } from "./isdoc-export";

const validator = (() => {
  const xsd = XmlDocument.fromBuffer(
    readFileSync(new URL("./schemy/isdoc-invoice-6.0.2.xsd", import.meta.url)),
  );
  return XsdValidator.fromDoc(xsd);
})();
const parser = new XMLParser({ removeNSPrefix: true, parseTagValue: false });

const firmaCz = {
  name: "Refurb s.r.o.",
  ico: "25097563",
  dic: "CZ25097563",
  street: "Dlouhá 12",
  city: "Praha",
  zip: "11000",
  country: "CZ",
  default_currency: "CZK",
};
const faktura = {
  id: "3f2a5c10-1b2c-4d3e-8f90-1234567890ab",
  invoice_number: "2026101",
  type: "regular",
  issue_date: "2026-09-10",
  delivery_date: "2026-09-10",
  due_date: "2026-09-24",
  currency: "EUR",
  exchange_rate: 24.3,
  customer_name: "Kunde GmbH",
  customer_country: "DE",
};
const polozky = [
  {
    name: "Notebook",
    quantity: 2,
    unit: "ks",
    unit_price: 100,
    vat_rate: 21,
    subtotal: 200,
    vat_amount: 42,
  },
];

const platne = (xml: string) => {
  const doc = XmlDocument.fromString(xml);
  try {
    validator.validate(doc);
  } finally {
    doc.dispose();
  }
};

describe("ISDOC v cudzej mene píše kurz", () => {
  it("CZ firma, faktúra v EUR s kurzom: domáca CZK, cudzia EUR, kurz ČNB", () => {
    const xml = buildIsdoc({ invoice: faktura, items: polozky, company: firmaCz });
    expect(() => platne(xml)).not.toThrow();
    const inv = parser.parse(xml).Invoice;
    expect(inv.LocalCurrencyCode).toBe("CZK");
    expect(inv.ForeignCurrencyCode).toBe("EUR");
    expect(inv.CurrRate).toBe("24.3");
    expect(inv.RefCurrRate).toBe("1");
    // Sumy bez prípony v korunách, …Curr v eurách.
    expect(inv.LegalMonetaryTotal.TaxExclusiveAmount).toBe("4860.00");
    expect(inv.LegalMonetaryTotal.TaxExclusiveAmountCurr).toBe("200.00");
    expect(inv.LegalMonetaryTotal.TaxInclusiveAmount).toBe("5880.60");
    expect(inv.LegalMonetaryTotal.PayableAmountCurr).toBe("242.00");
    expect(inv.TaxTotal.TaxSubTotal.TaxAmount).toBe("1020.60");
    expect(inv.TaxTotal.TaxSubTotal.TaxAmountCurr).toBe("42.00");
    expect(inv.InvoiceLines.InvoiceLine.LineExtensionAmountCurr).toBe("200.00");
    expect(inv.InvoiceLines.InvoiceLine.UnitPrice).toBe("2430.0000");
  });

  it("SK firma, faktúra v CZK: kurz ECB sa prevráti na EUR za 100 CZK", () => {
    const xml = buildIsdoc({
      invoice: { ...faktura, currency: "CZK", exchange_rate: 25 },
      items: polozky,
      company: { ...firmaCz, country: "SK" },
    });
    expect(() => platne(xml)).not.toThrow();
    const inv = parser.parse(xml).Invoice;
    expect(inv.LocalCurrencyCode).toBe("EUR");
    expect(inv.ForeignCurrencyCode).toBe("CZK");
    expect(inv.CurrRate).toBe("4");
    expect(inv.RefCurrRate).toBe("100");
    expect(inv.LegalMonetaryTotal.TaxExclusiveAmount).toBe("8.00");
  });

  it("bez kurzu ostáva mena dokladu s kurzom 1 a bez cudzej meny", () => {
    const xml = buildIsdoc({
      invoice: { ...faktura, exchange_rate: null },
      items: polozky,
      company: firmaCz,
    });
    expect(() => platne(xml)).not.toThrow();
    const inv = parser.parse(xml).Invoice;
    expect(inv.LocalCurrencyCode).toBe("EUR");
    expect(inv.ForeignCurrencyCode).toBeUndefined();
    expect(inv.CurrRate).toBe("1");
    expect(xml).not.toContain("Curr>");
  });
});
