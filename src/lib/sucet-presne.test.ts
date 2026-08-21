import { describe, it, expect } from "vitest";
import "./sucet-presne";

describe("Math.sumPrecise", () => {
  it("na serveri existuje", () => {
    expect(typeof (Math as { sumPrecise?: unknown }).sumPrecise).toBe("function");
  });

  it("nestráca drobné pri číslach veľmi rôznych rádov", () => {
    const sucet = (Math as unknown as { sumPrecise: (c: number[]) => number }).sumPrecise;
    // Obyčajné sčítanie zľava tu vráti 0 — veľké číslo malé zhltne.
    expect(sucet([1e100, 1, -1e100, 1])).toBe(2);
    expect(sucet([0.1, 0.2])).toBeCloseTo(0.3, 15);
    expect(sucet([])).toBe(0);
  });
});
