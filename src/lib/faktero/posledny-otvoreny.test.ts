import { describe, expect, it } from "vitest";
import { klucPoslednehoOtvoreneho, poslednyOtvoreny, zapamatajOtvoreny } from "./posledny-otvoreny";

function pamat() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    m,
  };
}

describe("posledný otvorený doklad", () => {
  it("pamätá si zvlášť pre zoznam a firmu", () => {
    const u = pamat();
    zapamatajOtvoreny("nespracovane", "firma-a", "d1", u);
    zapamatajOtvoreny("nespracovane", "firma-b", "d2", u);
    zapamatajOtvoreny("prijate-faktury", "firma-a", "p1", u);
    expect(poslednyOtvoreny("nespracovane", "firma-a", u)).toBe("d1");
    expect(poslednyOtvoreny("nespracovane", "firma-b", u)).toBe("d2");
    expect(poslednyOtvoreny("prijate-faktury", "firma-a", u)).toBe("p1");
    expect(poslednyOtvoreny("doklady", "firma-a", u)).toBeNull();
    // Ďalší otvorený prepíše predchádzajúci.
    zapamatajOtvoreny("nespracovane", "firma-a", "d3", u);
    expect(poslednyOtvoreny("nespracovane", "firma-a", u)).toBe("d3");
    expect(klucPoslednehoOtvoreneho("doklady", null)).toBe("faktero:posledny-otvoreny:doklady:-");
  });

  it("bez úložiska alebo pri chybe úložiska nič nepadne", () => {
    expect(poslednyOtvoreny("nespracovane", "f", null)).toBeNull();
    expect(() => zapamatajOtvoreny("nespracovane", "f", "x", null)).not.toThrow();
    const zle = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(() => zapamatajOtvoreny("nespracovane", "f", "x", zle)).not.toThrow();
    expect(poslednyOtvoreny("nespracovane", "f", zle)).toBeNull();
  });

  it("prázdne id sa neuloží", () => {
    const u = pamat();
    zapamatajOtvoreny("nespracovane", "f", "", u);
    expect(u.m.size).toBe(0);
  });
});
