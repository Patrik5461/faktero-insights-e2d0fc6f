/**
 * Faktúra, ktorá slúži zároveň ako dodací list, a pečiatka zapnutá či
 * vypnutá priamo na faktúre. Text sa číta z hotového PDF cez pdf.js.
 */
import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { generateInvoicePdfBytes } from "./pdf-generator.server";

async function textPdf(b: Uint8Array): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: b }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    text += c.items.map((x: any) => x.str).join(" ") + "\n";
  }
  return text.replace(/\s+/g, " ");
}

function pngPeciatky(): Uint8Array {
  return Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    ),
    (c) => c.charCodeAt(0),
  );
}

async function pocetObrazkov(bajty: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bajty);
  let n = 0;
  for (const strana of doc.getPages()) {
    const xo = strana.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    n += xo ? xo.keys().length : 0;
  }
  return n;
}

const firma = { name: "Tobify s. r. o.", country: "SK", iban: "SK3112000000198742637541" };
const faktura = {
  invoice_number: "2026001",
  type: "regular",
  status: "issued",
  issue_date: "2026-10-28",
  delivery_date: "2026-10-28",
  due_date: "2026-11-11",
  currency: "EUR",
  subtotal: 100,
  vat_total: 23,
  total: 123,
  customer_name: "Odberateľ s. r. o.",
};
const polozky = [
  {
    name: "Tovar",
    quantity: 1,
    unit: "ks",
    unit_price: 100,
    vat_rate: 23,
    subtotal: 100,
    vat_amount: 23,
    total: 123,
  },
];

describe("faktúra – dodací list", () => {
  it("bežná faktúra nemá nadpis dodacieho listu ani podpisy", async () => {
    const text = await textPdf(
      await generateInvoicePdfBytes({ company: firma, invoice: faktura, items: polozky }),
    );
    expect(text).toContain("FAKTÚRA");
    expect(text).not.toContain("DODACÍ LIST");
    expect(text).not.toContain("Prevzal");
  });

  it("dodací list zmení nadpis a pridá podpisy odovzdania a prevzatia", async () => {
    const text = await textPdf(
      await generateInvoicePdfBytes({
        company: firma,
        invoice: { ...faktura, dodaci_list: true },
        items: polozky,
      }),
    );
    expect(text).toContain("FAKTÚRA – DODACÍ LIST");
    expect(text).toContain("Odovzdal");
    expect(text).toContain("Prevzal");
  });

  it("v nemčine a češtine má nadpis v jazyku dokladu", async () => {
    const de = await textPdf(
      await generateInvoicePdfBytes({
        company: firma,
        invoice: { ...faktura, dodaci_list: true, language: "de" },
        items: polozky,
      }),
    );
    expect(de).toContain("RECHNUNG – LIEFERSCHEIN");
    expect(de).toContain("Empfangen");
    const cs = await textPdf(
      await generateInvoicePdfBytes({
        company: firma,
        invoice: { ...faktura, dodaci_list: true, language: "cs" },
        items: polozky,
      }),
    );
    expect(cs).toContain("FAKTURA – DODACÍ LIST");
    expect(cs).toContain("Převzal");
  });

  it("zálohová faktúra dodacím listom nie je", async () => {
    const text = await textPdf(
      await generateInvoicePdfBytes({
        company: firma,
        invoice: { ...faktura, type: "proforma", dodaci_list: true },
        items: polozky,
      }),
    );
    expect(text).not.toContain("DODACÍ LIST");
  });
});

describe("pečiatka zapnutá na faktúre", () => {
  it("faktúra prebije nastavenie firmy v oboch smeroch", async () => {
    const stampBytes = pngPeciatky();
    const bez = await pocetObrazkov(
      await generateInvoicePdfBytes({ company: firma, invoice: faktura, items: polozky }),
    );
    const vypnutaNaFakture = await generateInvoicePdfBytes({
      company: firma,
      invoice: { ...faktura, zobrazit_peciatku: false },
      items: polozky,
      stampBytes,
      stampMime: "image/png",
    });
    expect(await pocetObrazkov(vypnutaNaFakture)).toBe(bez);
    const zapnutaNaFakture = await generateInvoicePdfBytes({
      company: { ...firma, invoice_show_stamp: false },
      invoice: { ...faktura, zobrazit_peciatku: true },
      items: polozky,
      stampBytes,
      stampMime: "image/png",
    });
    expect(await pocetObrazkov(zapnutaNaFakture)).toBe(bez + 1);
  });
});
