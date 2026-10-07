import { it, expect } from "vitest";
import { buildPohodaInvoiceXml, buildPohodaExpensesXml } from "./export.server";
import { prijataAkoDoklad } from "./prijate-do-pohody";
it("faktúra v cudzej mene ide do Pohody s kurzom a sumami v mene", () => {
  const company: any = { ico: "12345678", country: "SK", default_currency: "EUR" };
  const x1 = buildPohodaInvoiceXml({
    company,
    invoices: [{
      invoice: { id: "a1", invoice_number: "2026001", issue_date: "2026-10-01", delivery_date: "2026-10-01", due_date: "2026-10-15", currency: "CZK", exchange_rate: 24.5, total: 1230, customer_name: "Firma CZ", type: "regular" } as any,
      items: [{ name: "Služba", quantity: 1, unit_price: 1000, subtotal: 1000, vat_amount: 0, vat_rate: 0, total: 1000 }, { name: "Tovar", quantity: 1, unit_price: 187, subtotal: 187, vat_amount: 43.01, vat_rate: 23, total: 230.01 }] as any,
    }],
  });
  const d = prijataAkoDoklad({ id: "b1", company_id: "c", supplier_name: "Google Ireland", invoice_number: "INV-9", issue_date: "2026-10-01", delivery_date: "2026-10-01", due_date: "2026-10-20", currency: "USD", exchange_rate: 1.1, amount_without_vat: 100, vat_amount: 0, amount_total: 100, payment_method: "karta" } as any);
  const x2 = buildPohodaExpensesXml({ company, doklady: [d] } as any);
  expect(x1).toContain("<typ:rate>4.081633</typ:rate>");
  expect(x2).toContain("<typ:ids>USD</typ:ids>");
  expect(x2).toContain("<typ:rate>0.909091</typ:rate>");
  expect(x1).not.toContain("<inv:homeCurrency>");
});
