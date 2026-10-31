import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { zipSync } from "fflate";
import { druhSuboru, tabulkaZXlsx } from "./nahratie.server";
import { tabulkaNaRiadky } from "./vypis-karty";

const K = { krajinaFirmy: "SK", mena: "EUR" };

function xlsx(riadky: unknown[][]): Uint8Array {
  const kniha = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(kniha, XLSX.utils.aoa_to_sheet(riadky), "Výpis");
  return new Uint8Array(XLSX.write(kniha, { type: "array", bookType: "xlsx" }));
}

describe("súbor výpisu", () => {
  it("druh podľa obsahu, nie podľa názvu", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 …");
    expect(druhSuboru("faktura.pdf", pdf)).toBe("pdf");
    expect(druhSuboru("vypis.csv", new TextEncoder().encode("Dátum;Suma\n"))).toBe("csv");
    expect(druhSuboru("vypis.xlsx", xlsx([["A"]]))).toBe("xlsx");
    expect(() => druhSuboru("vypis.pdf", new TextEncoder().encode("nie pdf"))).toThrow(/PDF/);
    expect(() => druhSuboru("obrazok.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toThrow(
      /Nepodporovaný/,
    );
  });

  it("XLSX s dátumom z Excelu a číslami", async () => {
    const b = xlsx([
      ["Výpis Up"],
      ["Dátum", "Produkt", "Množstvo", "Suma s DPH", "Sadzba DPH"],
      [46326.3, "Nafta", 40.5, 65.61, 0.23],
    ]);
    const v = tabulkaNaRiadky(await tabulkaZXlsx(b), K);
    expect(v.iste).toBe(true);
    expect(v.riadky[0]).toMatchObject({
      datum: "2026-10-31",
      mnozstvo: 40.5,
      spolu: 65.61,
      sadzbaDph: 23,
      jePalivo: true,
    });
    expect(v.riadky[0].cas).toBe("2026-10-31T07:12:00+01:00");
  });

  it("ZIP bomba sa zastaví skôr, než sa rozbalí", async () => {
    const bomba = zipSync({ "xl/worksheets/sheet1.xml": new Uint8Array(70 * 1024 * 1024) });
    await expect(tabulkaZXlsx(bomba)).rejects.toThrow(/príliš veľký/);
  });
});
