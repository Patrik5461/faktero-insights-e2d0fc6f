import { describe, it, expect } from "vitest";
import {
  JAZYKY_DOKLADU,
  jazykDokladu,
  popisky,
  localeDokladu,
  type JazykDokladu,
} from "./faktura-jazyk";

describe("jazyk dokladu", () => {
  it("neznámy jazyk padne na slovenčinu", () => {
    expect(jazykDokladu("fr")).toBe("sk");
    expect(jazykDokladu(null)).toBe("sk");
    expect(jazykDokladu(undefined)).toBe("sk");
  });

  it("každý jazyk má vyplnené všetky popisky", () => {
    const kluce = Object.keys(popisky("sk"));
    for (const j of JAZYKY_DOKLADU) {
      const p = popisky(j.kod) as Record<string, string>;
      for (const k of kluce) {
        expect(p[k], `${j.kod}.${k}`).toBeTruthy();
      }
    }
  });

  it("nadpis dokladu je preložený", () => {
    expect(popisky("en").faktura).toBe("INVOICE");
    expect(popisky("de").faktura).toBe("RECHNUNG");
    expect(popisky("cs").faktura).toBe("FAKTURA");
    expect(popisky("hu").faktura).toBe("SZÁMLA");
  });

  it("veta o prenose dane si drží odkaz na slovenský zákon", () => {
    for (const j of JAZYKY_DOKLADU) {
      expect(popisky(j.kod).prenosTuzemsko).toContain("222/2004");
    }
  });

  it("čísla sa formátujú podľa jazyka", () => {
    const suma = 1234.56;
    const f = (j: JazykDokladu) =>
      new Intl.NumberFormat(localeDokladu(j), { minimumFractionDigits: 2 })
        .format(suma)
        .replace(/ | /g, " ");
    expect(f("en")).toBe("1,234.56");
    expect(f("de")).toBe("1.234,56");
    expect(f("sk")).toBe("1 234,56");
  });
});
