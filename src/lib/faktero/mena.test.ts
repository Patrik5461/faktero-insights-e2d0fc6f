import { describe, it, expect } from "vitest";
import { formatujMenu } from "./mena";

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
