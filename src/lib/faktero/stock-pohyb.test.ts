import { describe, expect, it } from "vitest";
import { hodnotaPohybu, pohybDelta, pohybNazov, pohybText } from "./stock-pohyb";

describe("pohybDelta", () => {
  it("výdaj a faktúra uberajú aj z kladného množstva", () => {
    expect(pohybDelta("vydaj", 3)).toBe(-3);
    expect(pohybDelta("faktura", 2.5)).toBe(-2.5);
  });

  it("príjem a dobropis pridávajú", () => {
    expect(pohybDelta("prijem", 10)).toBe(10);
    expect(pohybDelta("dobropis", 4)).toBe(4);
  });

  it("oprava a inventúra si nesú znamienko samy", () => {
    expect(pohybDelta("oprava", -7)).toBe(-7);
    expect(pohybDelta("inventura", 5)).toBe(5);
  });

  it("nezmysly nespôsobia NaN", () => {
    expect(pohybDelta("prijem", null)).toBe(0);
    expect(pohybDelta(null, "x")).toBe(0);
  });
});

describe("pohybText", () => {
  it("ukáže smer pohybu", () => {
    expect(pohybText("vydaj", 3)).toBe("−3");
    expect(pohybText("prijem", 10)).toBe("+10");
    expect(pohybText("inventura", 0)).toBe("0");
  });
});

describe("hodnotaPohybu", () => {
  it("výdaj sa oceňuje váženou nákupnou cenou, nie predajnou", () => {
    // total_value je pri výdajke uložené v predajnej cene (10 × 12,50).
    expect(hodnotaPohybu({ quantity: 10, unit_cost: 9.125, total_value: 125 })).toBe(91.25);
  });

  it("bez váženej ceny ostáva uložená hodnota", () => {
    expect(hodnotaPohybu({ quantity: 3, unit_cost: null, total_value: -60 })).toBe(60);
  });

  it("prázdny pohyb je nula, nie NaN", () => {
    expect(hodnotaPohybu({})).toBe(0);
  });
});

describe("pohybNazov", () => {
  it("typ z databázy sa ukazuje po slovensky", () => {
    expect(pohybNazov("vydaj")).toBe("Výdaj");
    expect(pohybNazov("inventura")).toBe("Inventúra");
  });

  it("neznámy typ prejde tak, ako prišiel", () => {
    expect(pohybNazov("nieco")).toBe("nieco");
    expect(pohybNazov(null)).toBe("—");
  });
});
