import { describe, expect, it } from "vitest";
import { generateInvoicePdfBytes } from "./pdf-generator.server";

/*
  Doklady testovacej firmy (companies.testovacia_pre) majú šikmú vodotlač
  „TEST“ na každej strane; doklady skutočnej firmy sa nemenia.
*/

async function strany(b: Uint8Array): Promise<string[]> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: b }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    out.push(c.items.map((x: any) => x.str).join(" ").replace(/\s+/g, " "));
  }
  return out;
}

const firma = {
  name: "Vzor s.r.o.",
  dic: "2121733614",
  ic_dph: "SK2121733614",
  street: "Hlavná 1",
  city: "Trnava",
  zip: "917 01",
  country: "SK",
  vat_payer: true,
  iban: "SK2909000000005220542779",
};

function vstup(company: Record<string, unknown>, pocet = 1) {
  const items = Array.from({ length: pocet }, (_, i) => ({
    name: `Služba ${i + 1}`,
    quantity: 1,
    unit: "ks",
    unit_price: 100,
    vat_rate: 23,
    subtotal: 100,
    vat_amount: 23,
    total: 123,
  }));
  return {
    company,
    invoice: {
      invoice_number: "2026001",
      type: "regular",
      status: "issued",
      issue_date: "2026-11-17",
      delivery_date: "2026-11-17",
      due_date: "2026-12-01",
      variable_symbol: "2026001",
      payment_method: "bank_transfer",
      currency: "EUR",
      customer_name: "Odberateľ s.r.o.",
      customer_country: "SK",
      subtotal: 100 * pocet,
      vat_total: 23 * pocet,
      total: 123 * pocet,
    },
    items,
  } as any;
}

const jeVodotlac = (s: string) => /(^|\s)TEST(\s|$)/.test(s);

describe("vodotlač TEST na dokladoch testovacej firmy", () => {
  it("testovacia firma má TEST na každej strane", async () => {
    const s = await strany(
      await generateInvoicePdfBytes(vstup({ ...firma, testovacia_pre: "real-id" }, 40)),
    );
    expect(s.length).toBeGreaterThan(1);
    for (const strana of s) expect(jeVodotlac(strana)).toBe(true);
  });

  it("skutočná firma vodotlač nemá", async () => {
    const s = await strany(await generateInvoicePdfBytes(vstup({ ...firma, testovacia_pre: null })));
    expect(s.some(jeVodotlac)).toBe(false);
  });
});
