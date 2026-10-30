import { describe, expect, it } from "vitest";
import { generateInvoicePdfBytes } from "./pdf-generator.server";
import { vetaPreneseniaDe } from "./faktura-jazyk";

async function text(b: Uint8Array): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: b }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    out += c.items.map((x: any) => x.str).join(" ") + " ";
  }
  return out.replace(/\s+/g, " ");
}

function faktura(typ: string, plnenie: string, krajina: string) {
  return generateInvoicePdfBytes({
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
      invoice_number: "FA-2026-10",
      type: "regular",
      status: "issued",
      language: "sk",
      issue_date: "2026-10-30",
      delivery_date: "2026-10-30",
      due_date: "2026-11-13",
      currency: "EUR",
      variable_symbol: "202610",
      subtotal: 500,
      vat_total: 0,
      total: 500,
      customer_name: "Kunde GmbH",
      customer_country: krajina,
      customer_ic_dph: krajina === "DE" ? "DE123456789" : null,
      reverse_charge: true,
      reverse_charge_type: typ,
      eu_plnenie: plnenie,
    },
    items: [
      {
        name: "Konzultácia",
        quantity: 5,
        unit: "hod",
        unit_price: 100,
        vat_rate: 0,
        subtotal: 500,
        vat_amount: 0,
        total: 500,
      },
    ],
  } as any).then(text);
}

describe("PDF — veta podľa odberateľa z EÚ a mimo EÚ", () => {
  it("služba firme z EÚ: § 15 ods. 1 a prenesenie", async () => {
    const s = await faktura("eu_b2b", "sluzba", "DE");
    expect(s).toMatch(/§\s?15 ods\. 1/);
    expect(s).toMatch(/Prenesenie daňovej povinnosti/);
    expect(s).not.toMatch(/§\s?43/);
  });

  it("tovar firme z EÚ: § 43", async () => {
    expect(await faktura("eu_b2b", "tovar", "DE")).toMatch(/§\s?43/);
  });

  it("služba mimo EÚ nie je vývoz tovaru", async () => {
    const s = await faktura("export", "sluzba", "CH");
    expect(s).toMatch(/mimo územia EÚ podľa §\s?15/);
    expect(s).not.toMatch(/§\s?47/);
    expect(await faktura("export", "tovar", "CH")).toMatch(/§\s?47/);
  });

  it("nemecká firma: služba mimo EÚ nie je Ausfuhrlieferung", () => {
    expect(vetaPreneseniaDe("export", "sluzba")).not.toMatch(/Ausfuhr/);
    expect(vetaPreneseniaDe("export", "tovar")).toMatch(/Ausfuhr/);
  });
});
