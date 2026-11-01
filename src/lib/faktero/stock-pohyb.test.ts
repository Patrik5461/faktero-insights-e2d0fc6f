import { describe, expect, it } from "vitest";
import {
  cenaOcenenia,
  hodnotaPohybu,
  hodnotaZasoby,
  hraniceDniPohybov,
  nakladovaCenaPohybu,
  pohybDelta,
  pohybNazov,
  pohybText,
} from "./stock-pohyb";

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

describe("cenaOcenenia (SA-05)", () => {
  it("prednosť má vážená cena, nie posledná nákupná", () => {
    expect(cenaOcenenia({ avg_purchase_price: 9.13, purchase_price: 12 })).toBe(9.13);
    expect(hodnotaZasoby(10, { avg_purchase_price: 9.13, purchase_price: 12 })).toBeCloseTo(91.3);
  });
  it("bez priemeru padne na nákupnú cenu, bez oboch na nulu", () => {
    expect(cenaOcenenia({ avg_purchase_price: 0, purchase_price: 4 })).toBe(4);
    expect(cenaOcenenia({ avg_purchase_price: null, purchase_price: "4.5" })).toBe(4.5);
    expect(cenaOcenenia({})).toBe(0);
  });
});

describe("nakladovaCenaPohybu (SA-06)", () => {
  it("pri výdaji ukáže nákladovú cenu, nie predajnú", () => {
    expect(nakladovaCenaPohybu({ unit_cost: 9.13, unit_price: 12.5 })).toBe(9.13);
    expect(nakladovaCenaPohybu({ unit_cost: null, unit_price: 12.5 })).toBe(12.5);
  });
});

describe("hraniceDniPohybov (SA-16)", () => {
  it("„Od“ je miestna polnoc, nie UTC", () => {
    const { od, po } = hraniceDniPohybov("2026-11-01", "2026-11-02");
    expect(od).toBe(new Date(2026, 10, 1, 0, 0, 0, 0).toISOString());
    expect(po).toBe(new Date(2026, 10, 2, 23, 59, 59, 999).toISOString());
  });
  it("prázdne alebo zlé dátumy filter nedávajú", () => {
    expect(hraniceDniPohybov("", null)).toEqual({ od: null, po: null });
    expect(hraniceDniPohybov("1.11.2026", undefined)).toEqual({ od: null, po: null });
  });
});
