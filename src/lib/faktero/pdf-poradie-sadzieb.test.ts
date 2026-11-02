import { describe, expect, it } from "vitest";
import { generateInvoicePdfBytes } from "./pdf-generator.server";

/** Text prvej strany PDF. */
async function text(b: Uint8Array): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: b }).promise;
  const c = await (await doc.getPage(1)).getTextContent();
  return c.items
    .map((x: any) => x.str)
    .join(" ")
    .replace(/[\s ]+/g, " ");
}

const company = {
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
};

const polozka = (name: string, vat_rate: number, subtotal: number) => ({
  name,
  quantity: 1,
  unit: "ks",
  unit_price: subtotal,
  vat_rate,
  subtotal,
  vat_amount: Math.round(subtotal * vat_rate) / 100,
  total: subtotal + Math.round(subtotal * vat_rate) / 100,
});

/* Rekapitulácia DPH v PDF faktúry ide vzostupne: 0 → 5 → 19 → 23 %. */
describe("PDF — poradie sadzieb v rekapitulácii DPH", () => {
  it("položky 5, 23, 19 % dajú rekapituláciu 0, 5, 19, 23 % so správnymi sumami", async () => {
    const items = [
      polozka("Kniha", 5, 10),
      polozka("Služba", 23, 100),
      polozka("Ubytovanie", 19, 50),
    ];
    const t = await text(
      await generateInvoicePdfBytes({
        company,
        invoice: {
          invoice_number: "FA-2026-77",
          type: "regular",
          status: "issued",
          issue_date: "2026-11-02",
          delivery_date: "2026-11-02",
          due_date: "2026-11-16",
          currency: "EUR",
          variable_symbol: "202677",
          subtotal: 160,
          vat_total: 33.5,
          total: 193.5,
          customer_name: "Odberateľ a.s.",
          customer_country: "SK",
        },
        items,
      } as any),
    );
    // Rekapitulácia je posledná tabuľka so sadzbami — za hlavičkou „Spolu“.
    const rekap = t.slice(t.lastIndexOf("Sadzba"));
    const poradie = [...rekap.matchAll(/(\d+(?:,\d+)?) % /g)].map((m) => m[1]);
    expect(poradie.slice(0, 4)).toEqual(["0", "5", "19", "23"]);
    // Väzba sadzba ↔ základ ↔ daň ostáva.
    expect(rekap).toMatch(/5 % 10,00 EUR 0,50 EUR/);
    expect(rekap).toMatch(/19 % 50,00 EUR 9,50 EUR/);
    expect(rekap).toMatch(/23 % 100,00 EUR 23,00 EUR/);
  });
});
