import { describe, expect, it } from "vitest";
import { pocetRozdielov, spocitaneZPola } from "./sklad-inventura";

describe("pocetRozdielov (SA-18a)", () => {
  it("počíta len spočítané riadky s rozdielom", () => {
    expect(
      pocetRozdielov([
        { counted_quantity: 5, expected_quantity: 5 },
        { counted_quantity: 4, expected_quantity: 5 },
        { counted_quantity: null, expected_quantity: 5 },
        { counted_quantity: 0, expected_quantity: 2 },
      ]),
    ).toBe(2);
  });
});

describe("spocitaneZPola (SA-03)", () => {
  it("bez zmeny neukladá — sken sa neprepíše", () => {
    expect(spocitaneZPola(3, "3")).toEqual({ zmena: false, hodnota: 3 });
    expect(spocitaneZPola(null, "")).toEqual({ zmena: false, hodnota: null });
  });
  it("zmena a desatinná čiarka", () => {
    expect(spocitaneZPola(3, "2,5")).toEqual({ zmena: true, hodnota: 2.5 });
    expect(spocitaneZPola(3, "")).toEqual({ zmena: true, hodnota: null });
  });
  it("nezmysel je chyba", () => {
    expect(spocitaneZPola(3, "abc").chyba).toBe(true);
  });
});
