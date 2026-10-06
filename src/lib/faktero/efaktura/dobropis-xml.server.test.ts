import { describe, expect, it } from "vitest";
import { mapToEN16931 } from "./en16931.server";
import { generatePeppolBisXml } from "./xml.server";
import { parseEfakturaEnvelope } from "./inbound.server";

const firma: any = {
  name: "Faktero Demo s.r.o.",
  ico: "55555555",
  dic: "2120000000",
  ic_dph: "SK2120000000",
  street: "Skúšobná 1",
  city: "Trnava",
  zip: "917 01",
  country: "SK",
  iban: "SK3112000000198742637541",
};
const dobropis: any = {
  invoice_number: "D20260001",
  type: "credit_note",
  issue_date: "2026-10-05",
  due_date: "2026-10-19",
  currency: "EUR",
  variable_symbol: "999001",
  customer_name: "Ukážkový odberateľ s.r.o.",
  customer_ico: "44444444",
  customer_dic: "2022334455",
  customer_street: "Hlavná 12",
  customer_city: "Trnava",
  customer_zip: "917 01",
  customer_country: "SK",
  subtotal: -10,
  vat_total: -2.3,
  total: -12.3,
};
const polozky: any[] = [
  { name: "Vrátenie", quantity: -1, unit: "ks", unit_price: 10, vat_rate: 23, subtotal: -10, vat_amount: -2.3, total: -12.3 },
];

describe("dobropis v Peppol BIS", () => {
  it("je CreditNote s BillingReference a kladnými sumami", () => {
    const dto = mapToEN16931({
      company: firma,
      invoice: dobropis,
      items: polozky,
      povodnaFaktura: { cislo: "20260004", vystavena: "2026-09-01" },
    });
    const r = generatePeppolBisXml(dto);
    expect(r.xml).toContain('<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"');
    expect(r.xml).toContain("<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>");
    expect(r.xml).toMatch(/<cac:BillingReference>\s*<cac:InvoiceDocumentReference>\s*<cbc:ID>20260004<\/cbc:ID>\s*<cbc:IssueDate>2026-09-01<\/cbc:IssueDate>/);
    expect(r.xml).toContain("<cac:CreditNoteLine>");
    expect(r.xml).toMatch(/<cbc:CreditedQuantity unitCode="[A-Z0-9]+">1<\/cbc:CreditedQuantity>/);
    expect(r.xml).not.toContain("<cbc:DueDate>");
    expect(r.xml).not.toMatch(/>-\d/);
    // BillingReference musí byť pred stranami (poradie prvkov v UBL).
    expect(r.xml.indexOf("BillingReference")).toBeLessThan(r.xml.indexOf("AccountingSupplierParty"));
  });

  it("dobropis bez pôvodnej faktúry neprejde kontrolou", () => {
    const r = generatePeppolBisXml(mapToEN16931({ company: firma, invoice: dobropis, items: polozky }));
    expect(r.validationErrors.map((e) => e.code)).toContain("SK-BT-25");
  });

  it("faktúra ostáva Invoice", () => {
    const f = { ...dobropis, type: "regular", subtotal: 10, vat_total: 2.3, total: 12.3 };
    const p = [{ ...polozky[0], quantity: 1, subtotal: 10, vat_amount: 2.3, total: 12.3 }];
    const r = generatePeppolBisXml(mapToEN16931({ company: firma, invoice: f, items: p }));
    expect(r.xml).toContain("<Invoice ");
    expect(r.xml).toContain("<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>");
  });
});


describe("prijatý dobropis z Peppolu", () => {
  it("rozozná CreditNote a číslo pôvodnej faktúry", () => {
    const dto = mapToEN16931({
      company: firma,
      invoice: dobropis,
      items: polozky,
      povodnaFaktura: { cislo: "20260004", vystavena: "2026-09-01" },
    });
    const p = parseEfakturaEnvelope(generatePeppolBisXml(dto).xml);
    expect(p).toMatchObject({
      documentKind: "credit_note",
      typeCode: "381",
      precedingInvoiceNumber: "20260004",
      documentNumber: "D20260001",
      total: 12.3,
    });
  });

  it("samofaktúra 389 sa nezamení s prijatou faktúrou", () => {
    const p = parseEfakturaEnvelope(
      '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>SF1</cbc:ID><cbc:IssueDate>2026-10-01</cbc:IssueDate><cbc:InvoiceTypeCode>389</cbc:InvoiceTypeCode></Invoice>',
    );
    expect(p.documentKind).toBe("self_billing");
  });
});
