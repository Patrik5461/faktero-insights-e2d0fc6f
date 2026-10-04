import { describe, expect, it } from "vitest";
import { sumyRiadkov } from "./api-sumy-riadkov";

describe("sumyRiadkov", () => {
  it("bez súm z obchodu počíta Faktero samo", () => {
    expect(sumyRiadkov([{ quantity: 1, unit_price: 10, vat_rate: 23 }])).toEqual({ sumy: null });
  });

  it("prevezme sumy z e-shopu s cenami s DPH (objednávka 65,82 €)", () => {
    const r = sumyRiadkov([
      { quantity: 2, unit_price: 18.6626, vat_rate: 23, subtotal: 37.33, vat_amount: 8.58 },
      { quantity: 1, unit_price: 13.7815, vat_rate: 19, subtotal: 13.78, vat_amount: 2.62 },
      { quantity: 1, unit_price: 2.85, vat_rate: 23, subtotal: 2.85, vat_amount: 0.66 },
    ]);
    expect("sumy" in r && r.sumy).toMatchObject({
      subtotal: 53.96,
      vat_total: 11.86,
      total: 65.82,
    });
  });

  it("odmietne sumy, ktoré so sadzbou alebo cenou nesedia", () => {
    expect(
      sumyRiadkov([{ quantity: 1, unit_price: 10, vat_rate: 23, subtotal: 10, vat_amount: 1 }]),
    ).toHaveProperty("chyba");
    expect(
      sumyRiadkov([{ quantity: 1, unit_price: 10, vat_rate: 23, subtotal: 12, vat_amount: 2.76 }]),
    ).toHaveProperty("chyba");
  });

  it("odmietne mix riadkov so sumami a bez nich", () => {
    expect(
      sumyRiadkov([
        { quantity: 1, unit_price: 10, vat_rate: 23, subtotal: 10, vat_amount: 2.3 },
        { quantity: 1, unit_price: 10, vat_rate: 23 },
      ]),
    ).toHaveProperty("chyba");
  });
});
