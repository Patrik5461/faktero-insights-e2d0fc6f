/*
  Vyúčtovacia faktúra so zálohou zdanenou dokladom k prijatej platbe (QA 30. 10.,
  NK20260046 − ZF20260005 / DDP20260003): PDF ukazovalo plnú DPH 69 €, hoci 23 €
  bolo priznaných dokladom k platbe. Rozpis teraz zálohu odpočíta po sadzbách.
*/
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateInvoicePdfBytes } from "./pdf-generator.server";

async function textPdf(b: Uint8Array): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: b }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    text += c.items.map((x: any) => x.str).join(" ") + "\n";
  }
  return text.replace(/\s+/g, " ").replace(/ /g, " ");
}

const vstup = (zalohy: any) =>
  ({
    company: {
      name: "Test",
      ico: "86179504",
      dic: "4286179504",
      ic_dph: "SK4286179504",
      street: "Testovacia 1",
      city: "Bratislava",
      zip: "81101",
      country: "SK",
      iban: "SK3112000000198742637541",
      vat_payer: true,
    },
    invoice: {
      invoice_number: "NK20260046",
      type: "regular",
      issue_date: "2026-10-30",
      delivery_date: "2026-10-30",
      due_date: "2026-11-13",
      variable_symbol: "20260046",
      payment_method: "bank_transfer",
      currency: "EUR",
      customer_name: "Zálohový odberateľ s.r.o.",
      customer_country: "SK",
      intro_note: "Fakturujeme Vám",
      subtotal: 300,
      vat_total: 69,
      total: 369,
      advance_amount: 123,
    },
    items: [
      { name: "Dielo", quantity: 1, unit: "ks", unit_price: 300, vat_rate: 23, subtotal: 300, vat_amount: 69, total: 369 },
    ],
    zalohy,
  }) as any;

describe("vyúčtovanie zálohy v PDF", () => {
  it("zdanená záloha sa odpočíta v rozpise DPH a daň na úhradu je rozdiel", async () => {
    const b = await generateInvoicePdfBytes(
      vstup([
        {
          zaloha: "ZF20260005",
          doklad: "DDP20260003",
          vs: "20260005",
          suma: 123,
          riadky: [{ sadzba: 23, zaklad: 100, dph: 23 }],
        },
      ]),
    );
    const strany = (await PDFDocument.load(b)).getPageCount();
    const t = await textPdf(b);
    expect(t).toContain("Záloha DDP20260003");
    expect(t).toMatch(/-100,00 EUR -23,00 EUR -123,00 EUR/);
    expect(t).toMatch(/DPH spolu 46,00 EUR|DPH 46,00 EUR/);
    expect(t).not.toContain("Zúčtovaná záloha");
    expect(t).toContain("246,00 EUR");
    expect(strany).toBe(1);
  });

  it("nezdanená záloha ostáva riadkom Zúčtovaná záloha a DPH je celá", async () => {
    const t = await textPdf(
      await generateInvoicePdfBytes(
        vstup([{ zaloha: "ZF20260005", doklad: null, vs: null, suma: 123, riadky: [] }]),
      ),
    );
    expect(t).toContain("Zúčtovaná záloha − 123,00 EUR");
    expect(t).toMatch(/DPH 69,00 EUR/);
    expect(t).toContain("Spolu 369,00 EUR");
    expect(t).toContain("246,00 EUR");
  });

  it("bez načítaných odpočtov sa správa ako doteraz", async () => {
    const t = await textPdf(await generateInvoicePdfBytes(vstup(null)));
    expect(t).toContain("Zúčtovaná záloha − 123,00 EUR");
  });
});
