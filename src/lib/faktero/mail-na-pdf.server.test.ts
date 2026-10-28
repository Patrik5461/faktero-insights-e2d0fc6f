import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { pdfZMailu } from "./mail-na-pdf.server";

describe("e-mail bez dokladu ako PDF", () => {
  it("vyrobí PDF s diakritikou, dlhým odkazom aj viac stranami", async () => {
    const text = `Dobrý deň, faktúra č. 2026-15 na 120,00 € je na odkaze https://example.com/${"x".repeat(300)}\n\n${"Ďalší riadok textu.\n".repeat(120)}`;
    const bajty = await pdfZMailu({
      od: "Účtáreň <a@b.sk>",
      komu: "firma@doklady.faktero.sk",
      predmet: "Faktúra 2026-15",
      prijate: "28. 10. 2026 18:00",
      text,
    });
    expect(Buffer.from(bajty.slice(0, 4)).toString()).toBe("%PDF");
    const pdf = await PDFDocument.load(bajty);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
