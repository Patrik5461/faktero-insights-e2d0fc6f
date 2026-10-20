import { describe, expect, it } from "vitest";
import { rozpisDokladuKPlatbe } from "./doklad-k-platbe";

describe("rozpisDokladuKPlatbe", () => {
  it("záloha 8 000 € s DPH 23 % dá doklad presne na 8 000,00 €", () => {
    const r = rozpisDokladuKPlatbe(
      [{ quantity: 1, unit_price: 6504.06504, vat_rate: 23, total: 8000 }],
      8000,
    );
    expect(r.total).toBe(8000);
    expect(r.vat_total).toBe(1495.93);
    expect(r.subtotal).toBe(6504.07);
  });

  it("čiastočná platba a dve sadzby — súčet sedí na halier", () => {
    const r = rozpisDokladuKPlatbe(
      [
        { quantity: 2, unit_price: 100, vat_rate: 23, total: 246 },
        { quantity: 1, unit_price: 50, vat_rate: 5, total: 52.5 },
      ],
      100,
    );
    expect(r.total).toBe(100);
    expect(r.riadky.reduce((a, x) => a + x.total, 0)).toBeCloseTo(100, 10);
    for (const x of r.riadky) expect(x.subtotal + x.vat_amount).toBeCloseTo(x.total, 10);
  });

  it("prenesenie daňovej povinnosti (0 %) — bez dane", () => {
    const r = rozpisDokladuKPlatbe(
      [{ quantity: 1, unit_price: 1000, vat_rate: 0, total: 1000 }],
      1000,
    );
    expect(r).toMatchObject({ subtotal: 1000, vat_total: 0, total: 1000 });
  });
});
