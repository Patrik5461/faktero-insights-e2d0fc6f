import { describe, expect, it } from "vitest";
import { sumyFormulara } from "./faktura-formular-sumy";

const zaklad = { reverse_charge: false, discount_type: "" as const, discount_value: 0 };

describe("súčty formulára — úprava = vystavenie (C-03, C-05, C-10)", () => {
  it("hotovosť v eurách na 0,05 €, v korunách na celé Kč", () => {
    const riadky = [{ quantity: 1, unit_price: 10.01, vat_rate: 23 }];
    const eur = sumyFormulara(riadky, { ...zaklad, rounding_mode: "retail", mena: "EUR" });
    expect(eur.total).toBe(12.3);
    const czk = sumyFormulara([{ quantity: 1, unit_price: 100.4, vat_rate: 21 }], {
      ...zaklad,
      rounding_mode: "retail",
      mena: "CZK",
    });
    // 100,40 + 21,08 = 121,48 → 121 Kč; základ a daň ostávajú presné.
    expect(czk.subtotal).toBe(100.4);
    expect(czk.vat_total).toBe(21.08);
    expect(czk.total).toBe(121);
  });

  it("po položkách zaokrúhli každý riadok", () => {
    const riadky = [
      { quantity: 1, unit_price: 0.333, vat_rate: 23 },
      { quantity: 1, unit_price: 0.333, vat_rate: 23 },
    ];
    expect(sumyFormulara(riadky, { ...zaklad, rounding_mode: "per_item" }).subtotal).toBeCloseTo(
      0.66,
      10,
    );
    expect(sumyFormulara(riadky, { ...zaklad, rounding_mode: "per_document" }).subtotal).toBe(0.67);
  });

  it("prenesenie na celom doklade: žiadna daň, aj keď riadok nesie 23 %", () => {
    const s = sumyFormulara([{ quantity: 1, unit_price: 100, vat_rate: 23 }], {
      ...zaklad,
      reverse_charge: true,
      rounding_mode: "per_document",
    });
    expect(s.vat_total).toBe(0);
    expect(s.total).toBe(100);
  });

  it("odpočet zálohy znižuje len sumu na úhradu", () => {
    const s = sumyFormulara([{ quantity: 1, unit_price: 100, vat_rate: 23 }], {
      ...zaklad,
      rounding_mode: "per_document",
      zalohy: [50],
    });
    expect(s.total).toBe(123);
    expect(s.payable).toBe(73);
  });
});
