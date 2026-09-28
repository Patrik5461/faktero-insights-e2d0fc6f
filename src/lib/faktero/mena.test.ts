import { describe, it, expect } from "vitest";
import { formatujMenu, formatujJednotkovuCenu, KROK_CENY, cenaZoSumySDph } from "./mena";

const bezMedzier = (s: string) => s.replace(/ | /g, " ");

describe("formatujMenu", () => {
  it("bežná mena sa vypíše ako mena", () => {
    expect(bezMedzier(formatujMenu(1234.5, "EUR"))).toContain("€");
    expect(bezMedzier(formatujMenu(10, "CZK"))).toMatch(/K/);
  });

  it("nezmyselný kód stránku nezhodí, len sa vypíše", () => {
    // Presne to zhodilo prehľad: `Intl` vyhodí RangeError, nie náhradný text.
    const out = bezMedzier(formatujMenu(100, "QA položka"));
    expect(out).toContain("100");
    expect(out).toContain("QA položka");
  });

  it("tri písmená, ktoré menou nie sú, prejdú tiež", () => {
    expect(bezMedzier(formatujMenu(5, "QQQ"))).toContain("QQQ");
  });

  it("chýbajúca mena vypíše len číslo", () => {
    expect(bezMedzier(formatujMenu(7, null)).trim()).toBe("7,00");
    expect(bezMedzier(formatujMenu(7, "")).trim()).toBe("7,00");
  });

  it("malé písmená sa doplnia na veľké", () => {
    expect(bezMedzier(formatujMenu(1, "eur"))).toContain("€");
  });

  it("nečíselná hodnota je nula, nie NaN", () => {
    expect(bezMedzier(formatujMenu("nič", "EUR"))).toContain("0,00");
  });
});

describe("formatujJednotkovuCenu", () => {
  it("bežná cena ostáva na dvoch miestach", () => {
    expect(bezMedzier(formatujJednotkovuCenu(12.5)).trim()).toBe("12,50");
    expect(bezMedzier(formatujJednotkovuCenu(2)).trim()).toBe("2,00");
  });

  it("jemnejšia cena ukáže až päť miest", () => {
    expect(bezMedzier(formatujJednotkovuCenu(0.125)).trim()).toBe("0,125");
    expect(bezMedzier(formatujJednotkovuCenu(1.23456)).trim()).toBe("1,23456");
  });

  it("nuly navyše sa neukazujú", () => {
    expect(bezMedzier(formatujJednotkovuCenu(0.1)).trim()).toBe("0,10");
  });

  it("s menou funguje rovnako", () => {
    expect(bezMedzier(formatujJednotkovuCenu(0.125, "EUR"))).toContain("0,125");
  });

  it("nečíselná hodnota je nula, nie NaN", () => {
    expect(bezMedzier(formatujJednotkovuCenu("nič")).trim()).toBe("0,00");
  });

  it("krok políčka pustí päť desatinných miest", () => {
    expect(KROK_CENY).toBe("0.00001");
  });
});

describe("cenaZoSumySDph", () => {
  it("z sumy s DPH dopočíta jednotkovú cenu", () => {
    expect(cenaZoSumySDph(123, 1, 23)).toBe(100);
    expect(cenaZoSumySDph(120, 1, 20)).toBe(100);
    expect(cenaZoSumySDph(246, 2, 23)).toBe(100);
  });
  it("pri nulovej sadzbe (prenos daňovej povinnosti) vráti sumu delenú množstvom", () => {
    expect(cenaZoSumySDph(250, 2, 0)).toBe(125);
  });
  it("suma sa po prepočte vráti späť na to isté euro", () => {
    const cena = cenaZoSumySDph(100, 3, 23);
    expect(+(cena * 3 * 1.23).toFixed(2)).toBe(100);
  });
  it("bez množstva počíta s jedným kusom a nečíslo nezhodí výpočet", () => {
    expect(cenaZoSumySDph(123, 0, 23)).toBe(100);
    expect(cenaZoSumySDph("x", 1, 23)).toBe(0);
  });
});
