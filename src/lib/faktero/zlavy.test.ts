import { describe, it, expect } from "vitest";
import {
  koeficientZlavy,
  maZlavu,
  percentoZlavy,
  popisZlavy,
  riadkySoZlavou,
  sumaZlavyDokladu,
  zakladRiadku,
} from "./zlavy";

describe("zľava riadku", () => {
  it("zníži základ o percento", () => {
    expect(zakladRiadku(3, 50, 10)).toBe(135);
    expect(zakladRiadku(1, 80, 0)).toBe(80);
  });
  it("bez zľavy počíta obyčajné množstvo krát cena", () => {
    expect(zakladRiadku(2, 12.5)).toBe(25);
  });
  it("percento mimo rozsahu oreže, nečíslo berie ako nulu", () => {
    expect(percentoZlavy(-5)).toBe(0);
    expect(percentoZlavy(150)).toBe(100);
    expect(percentoZlavy("x")).toBe(0);
    expect(zakladRiadku(1, 100, 100)).toBe(0);
  });
});

describe("zľava na doklad", () => {
  it("percento počíta zo základu", () => {
    expect(sumaZlavyDokladu(215, { typ: "percent", hodnota: 5 })).toBe(10.75);
  });
  it("pevná suma sa berie tak, ako je zadaná", () => {
    expect(sumaZlavyDokladu(215, { typ: "amount", hodnota: 15 })).toBe(15);
  });
  it("nikdy nespraví zápornú faktúru", () => {
    expect(sumaZlavyDokladu(100, { typ: "amount", hodnota: 500 })).toBe(100);
    expect(sumaZlavyDokladu(100, { typ: "percent", hodnota: 150 })).toBe(100);
  });
  it("bez typu alebo s nulou nezľavňuje", () => {
    expect(sumaZlavyDokladu(100, { typ: null, hodnota: 10 })).toBe(0);
    expect(sumaZlavyDokladu(100, { typ: "percent", hodnota: 0 })).toBe(0);
    expect(maZlavu({ typ: "percent", hodnota: 0 })).toBe(false);
    expect(maZlavu({ typ: "amount", hodnota: 5 })).toBe(true);
  });
  it("zo záporného alebo nulového základu sa nezľavňuje", () => {
    expect(sumaZlavyDokladu(0, { typ: "percent", hodnota: 10 })).toBe(0);
  });
});

describe("rozpočítanie medzi sadzby", () => {
  it("koeficient znižuje základ aj daň rovnako, takže pomer sadzieb ostane", () => {
    const riadky = [
      { zaklad: 100, sadzba: 23 },
      { zaklad: 100, sadzba: 5 },
    ];
    const zakladSpolu = 200;
    const zlava = sumaZlavyDokladu(zakladSpolu, { typ: "percent", hodnota: 10 });
    const k = koeficientZlavy(zakladSpolu, zlava);
    const po = riadky.map((r) => ({
      zaklad: +(r.zaklad * k).toFixed(2),
      dph: +(((r.zaklad * k * r.sadzba) / 100)).toFixed(2),
    }));
    expect(zlava).toBe(20);
    expect(po).toEqual([
      { zaklad: 90, dph: 20.7 },
      { zaklad: 90, dph: 4.5 },
    ]);
  });
  it("bez zľavy je koeficient 1", () => {
    expect(koeficientZlavy(200, 0)).toBe(1);
    expect(koeficientZlavy(0, 10)).toBe(1);
  });
  it("zľava vo výške celého základu vynuluje doklad, nie ho otočí", () => {
    expect(koeficientZlavy(100, 100)).toBe(0);
  });
});

describe("popis zľavy", () => {
  it("percento aj sumu píše tak, ako sa zadali", () => {
    expect(popisZlavy({ typ: "percent", hodnota: 10 })).toBe("10 %");
    expect(popisZlavy({ typ: "amount", hodnota: 25 }, "EUR").replace(/ /g, " ")).toBe(
      "25,00 EUR",
    );
    expect(popisZlavy({ typ: null, hodnota: 10 })).toBe("");
  });
});

describe("rozpočítanie zľavy do riadkov pre export", () => {
  const riadky = [
    { subtotal: 100, vat_amount: 23, total: 123, unit_price: 100, vat_rate: 23 },
    { subtotal: 100, vat_amount: 5, total: 105, unit_price: 50, vat_rate: 5 },
  ];
  it("zníži riadky tak, že ich súčet sedí na faktúru", () => {
    const po = riadkySoZlavou(riadky, 20);
    expect(po.map((r) => r.subtotal)).toEqual([90, 90]);
    expect(po.map((r) => r.vat_amount)).toEqual([20.7, 4.5]);
    expect(po.reduce((s, r) => s + r.subtotal, 0)).toBe(180);
  });
  it("halier zo zaokrúhlenia dorovná posledný riadok", () => {
    const tri = [
      { subtotal: 33.33, vat_amount: 7.67, total: 41, unit_price: 33.33 },
      { subtotal: 33.33, vat_amount: 7.67, total: 41, unit_price: 33.33 },
      { subtotal: 33.34, vat_amount: 7.67, total: 41.01, unit_price: 33.34 },
    ];
    const po = riadkySoZlavou(tri, 10);
    const spolu = po.reduce((s, r) => s + r.subtotal, 0);
    expect(+spolu.toFixed(2)).toBe(90);
  });
  it("bez zľavy vráti riadky nedotknuté", () => {
    expect(riadkySoZlavou(riadky, 0)).toBe(riadky);
    expect(riadkySoZlavou([], 10)).toEqual([]);
  });
});
