import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { generateInvoicePdfBytes } from "./pdf-generator.server";

/** Malé PNG so „pečiatkou" — skutočný obrázok, nech ho pdf-lib naozaj vloží. */
function pngPeciatky(): Uint8Array {
  return Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    ),
    (c) => c.charCodeAt(0),
  );
}

const firma = { name: "Tobify s. r. o.", country: "SK" };
const faktura = {
  invoice_number: "2026001",
  issue_date: "2026-09-21",
  due_date: "2026-10-05",
  currency: "EUR",
  total: 123,
  subtotal: 100,
  vat_total: 23,
};
const polozky = [{ description: "Konzultácia", quantity: 1, unit_price: 100, vat_rate: 23 }];

/** Počet obrázkov (XObject) na všetkých stranách dokladu. */
async function pocetObrazkov(bajty: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bajty);
  let n = 0;
  for (const strana of doc.getPages()) {
    const xo = strana.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    n += xo ? xo.keys().length : 0;
  }
  return n;
}

describe("pečiatka na faktúre", () => {
  it("vloží pečiatku, keď je nahratá a zapnutá", async () => {
    const stampBytes = pngPeciatky();
    const bez = await generateInvoicePdfBytes({ company: firma, invoice: faktura, items: polozky });
    const s = await generateInvoicePdfBytes({
      company: firma,
      invoice: faktura,
      items: polozky,
      stampBytes,
      stampMime: "image/png",
    });
    expect(await pocetObrazkov(s)).toBe((await pocetObrazkov(bez)) + 1);
  });

  it("vypnutá pečiatka sa nekreslí", async () => {
    const s = await generateInvoicePdfBytes({
      company: { ...firma, invoice_show_stamp: false },
      invoice: faktura,
      items: polozky,
      stampBytes: pngPeciatky(),
      stampMime: "image/png",
    });
    const bez = await generateInvoicePdfBytes({ company: firma, invoice: faktura, items: polozky });
    expect(await pocetObrazkov(s)).toBe(await pocetObrazkov(bez));
  });

  it("poškodený obrázok faktúru nezhodí", async () => {
    const s = await generateInvoicePdfBytes({
      company: firma,
      invoice: faktura,
      items: polozky,
      stampBytes: new Uint8Array([1, 2, 3]),
      stampMime: "image/png",
    });
    expect((await PDFDocument.load(s)).getPageCount()).toBeGreaterThan(0);
  });
});
