import { describe, expect, it } from "vitest";
import { buildPohodaInvoiceXml } from "./export.server";
import { buildIsdoc } from "./isdoc-export";
import { druhZFaktury } from "./efaktura/epostak-telo";
import { druhPodlaTypuFaktury } from "./ciselne-rady";

const company: any = { name: "QA s.r.o.", ico: "12345678", dic: "2120000000", country: "SK", default_currency: "EUR", street: "Hlavná 1", city: "Nitra", zip: "94901" };
const invoice: any = {
  id: "t1",
  type: "debit_note",
  invoice_number: "2026095",
  issue_date: "2026-10-07",
  delivery_date: "2026-10-07",
  due_date: "2026-10-21",
  currency: "EUR",
  subtotal: 10,
  vat_total: 2.3,
  total: 12.3,
  customer_name: "Odberateľ s.r.o.",
  customer_ico: "44444444",
};
const items: any[] = [{ name: "Doúčtovanie", quantity: 1, unit: "ks", unit_price: 10, subtotal: 10, vat_amount: 2.3, vat_rate: 23, total: 12.3 }];

describe("ťarchopis v exportoch", () => {
  it("Pohoda: vydaný ťarchopis s väzbou na pôvodnú faktúru a kladnými sumami", () => {
    const x = buildPohodaInvoiceXml({ company, invoices: [{ invoice, items }], opravovane: { t1: "2026001" } });
    expect(x).toContain("<inv:invoiceType>issuedDebitNote</inv:invoiceType>");
    expect(x).toMatch(/<inv:correctiveDocument itemTransfer="false">\s*<typ:sourceDocument>\s*<typ:number>2026001<\/typ:number>/);
    expect(x).toContain("<inv:quantity>1</inv:quantity>");
  });
  it("ISDOC: typ dokladu 3 (vrubopis)", () => {
    expect(buildIsdoc({ invoice, items, company })).toContain("<DocumentType>3</DocumentType>");
  });
  it("eFaktúra a číselný rad", () => {
    expect(druhZFaktury("debit_note", 12.3)).toBe("debit_note");
    expect(druhPodlaTypuFaktury("debit_note")).toBe("debit_note");
  });
});
