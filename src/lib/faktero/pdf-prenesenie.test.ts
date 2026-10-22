import { describe, expect, it } from "vitest";
import { generateInvoicePdfBytes } from "./pdf-generator.server";

/** Text jednotlivých strán PDF. */
async function strany(b: Uint8Array): Promise<string[]> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: b }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    out.push(
      c.items
        .map((x: any) => x.str)
        .join(" ")
        .replace(/\s+/g, " "),
    );
  }
  return out;
}

describe("PDF — veta o prenesení daňovej povinnosti", () => {
  it("je na prvej strane aj pri faktúre s mnohými položkami", async () => {
    const polozky = Array.from({ length: 40 }, (_, i) => ({
      name: `Stavebné práce — etapa ${i + 1}`,
      quantity: 1,
      unit: "ks",
      unit_price: 100,
      vat_rate: 23,
      subtotal: 100,
      vat_amount: 0,
      total: 100,
    }));
    const s = await strany(
      await generateInvoicePdfBytes({
        company: {
          name: "Test s.r.o.",
          country: "SK",
          street: "Hlavná 1",
          city: "Bratislava",
          zip: "81101",
          ico: "12345678",
          dic: "2020123456",
          ic_dph: "SK2020123456",
          iban: "SK3112000000198742637541",
          vat_payer: true,
        },
        invoice: {
          invoice_number: "FA-2026-9",
          type: "regular",
          status: "issued",
          issue_date: "2026-10-22",
          delivery_date: "2026-10-22",
          due_date: "2026-11-05",
          currency: "EUR",
          variable_symbol: "20269",
          subtotal: 4000,
          vat_total: 0,
          total: 4000,
          customer_name: "Stavby a.s.",
          customer_country: "SK",
          customer_ic_dph: "SK2021234567",
          reverse_charge: true,
          reverse_charge_type: "domestic_69",
        },
        items: polozky,
      } as any),
    );
    expect(s.length).toBeGreaterThan(1);
    expect(s[0]).toMatch(/prenesen/i);
  });
});
