import { describe, it, expect } from "vitest";
import { zostatkyPodlaMien, formatujSumu, normalizujMenu, zobrazitZauctovany } from "./zostatky";

describe("zostatkyPodlaMien", () => {
  it("nemieša meny do jedného čísla", () => {
    const z = zostatkyPodlaMien([
      { currency: "EUR", balance: 699.47 },
      { currency: "CZK", balance: 14927.64 },
      { currency: "EUR", balance: 34.85 },
      { currency: "HUF", balance: 0 },
    ]);
    expect(z).toEqual([
      { mena: "EUR", suma: 734.32 },
      { mena: "CZK", suma: 14927.64 },
      { mena: "HUF", suma: 0 },
    ]);
  });

  it("EUR je vždy prvé, zvyšok podľa abecedy", () => {
    const z = zostatkyPodlaMien([
      { currency: "USD", balance: 1 },
      { currency: "CZK", balance: 1 },
      { currency: "EUR", balance: 1 },
    ]);
    expect(z.map((x) => x.mena)).toEqual(["EUR", "CZK", "USD"]);
  });

  it("chýbajúca mena je EUR a nečíselný zostatok nula", () => {
    expect(zostatkyPodlaMien([{ balance: 5 }, { currency: null, balance: "nezmysel" }])).toEqual([
      { mena: "EUR", suma: 5 },
    ]);
  });

  it("prázdny zoznam nevráti nič", () => {
    expect(zostatkyPodlaMien([])).toEqual([]);
    expect(zostatkyPodlaMien(null)).toEqual([]);
  });

  it("centy sa nerozsypú na float", () => {
    const z = zostatkyPodlaMien([
      { currency: "EUR", balance: 0.1 },
      { currency: "EUR", balance: 0.2 },
    ]);
    expect(z[0].suma).toBe(0.3);
  });
});

describe("formatujSumu", () => {
  it("vypíše sumu v mene účtu", () => {
    expect(formatujSumu(1608.19, "EUR")).toMatch(/1\s?608,19/);
    expect(formatujSumu(14927.64, "CZK")).toMatch(/14\s?927,64/);
  });

  it("neznáma mena nepadne", () => {
    expect(formatujSumu(10, "XYZ123")).toContain("XYZ123");
  });
});

describe("normalizujMenu", () => {
  it("prázdna mena je EUR", () => {
    expect(normalizujMenu(null)).toBe("EUR");
    expect(normalizujMenu("  ")).toBe("EUR");
    expect(normalizujMenu("czk")).toBe("CZK");
  });
});

describe("zobrazitZauctovany", () => {
  it("ukáže sa len keď sa líši od disponibilného", () => {
    expect(zobrazitZauctovany(204575.08, 4593.78)).toEqual({ zobrazit: true, suma: 4593.78 });
    expect(zobrazitZauctovany(687.47, 687.47).zobrazit).toBe(false);
    expect(zobrazitZauctovany(687.47, null).zobrazit).toBe(false);
    expect(zobrazitZauctovany(687.47, undefined).zobrazit).toBe(false);
  });

  it("rozdiel pod pol centa sa neukazuje", () => {
    expect(zobrazitZauctovany(100, 100.001).zobrazit).toBe(false);
    expect(zobrazitZauctovany(100, 100.01).zobrazit).toBe(true);
  });
});
