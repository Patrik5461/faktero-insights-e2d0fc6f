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

describe("sumyFakturyApi", () => {
  it("bez zľavy a prenesenia počíta ako doteraz (zaokrúhlenie po položkách)", async () => {
    const { sumyFakturyApi } = await import("./api-sumy-riadkov");
    const r = sumyFakturyApi([
      { quantity: 4, unit_price: 75, vat_rate: 23 },
      { quantity: 3, unit_price: 0.33, vat_rate: 5 },
    ]);
    expect("sumy" in r && r.sumy).toMatchObject({
      subtotal: 300.99,
      vat_total: 69.05,
      total: 370.04,
      discount_total: 0,
      discount_type: null,
    });
  });

  it("zľava riadku je v základe, jednotková cena ostáva", async () => {
    const { sumyFakturyApi } = await import("./api-sumy-riadkov");
    const r = sumyFakturyApi([
      { quantity: 1, unit_price: 100, vat_rate: 23, discount_percent: 10 },
    ]);
    if (!("sumy" in r)) throw new Error(r.chyba);
    expect(r.sumy).toMatchObject({ subtotal: 90, vat_total: 20.7, total: 110.7 });
    expect(r.sumy.riadky[0]).toMatchObject({ unit_price: 100, discount_percent: 10, subtotal: 90 });
  });

  it("zľava na doklad sa rozpočíta pomerne, riadky ostanú", async () => {
    const { sumyFakturyApi } = await import("./api-sumy-riadkov");
    const r = sumyFakturyApi(
      [
        { quantity: 1, unit_price: 100, vat_rate: 23 },
        { quantity: 1, unit_price: 100, vat_rate: 5 },
      ],
      { discount_type: "amount", discount_value: 50 },
    );
    if (!("sumy" in r)) throw new Error(r.chyba);
    expect(r.sumy).toMatchObject({
      subtotal: 150,
      vat_total: 21,
      total: 171,
      discount_type: "amount",
      discount_total: 50,
    });
    expect(r.sumy.riadky.map((x) => x.subtotal)).toEqual([100, 100]);
  });

  it("prenesenie: DPH nula, sadzba riadku 0", async () => {
    const { sumyFakturyApi } = await import("./api-sumy-riadkov");
    const r = sumyFakturyApi([{ quantity: 2, unit_price: 500, vat_rate: 23 }], {
      reverse_charge: true,
    });
    if (!("sumy" in r)) throw new Error(r.chyba);
    expect(r.sumy).toMatchObject({ subtotal: 1000, vat_total: 0, total: 1000 });
    expect(r.sumy.riadky[0]).toMatchObject({ vat_rate: 0, vat_amount: 0, prenesenie: false });
  });

  it("prenesenie len pri položke", async () => {
    const { sumyFakturyApi } = await import("./api-sumy-riadkov");
    const r = sumyFakturyApi([
      { quantity: 1, unit_price: 100, vat_rate: 23, prenesenie: true },
      { quantity: 1, unit_price: 100, vat_rate: 23 },
    ]);
    if (!("sumy" in r)) throw new Error(r.chyba);
    expect(r.sumy).toMatchObject({ subtotal: 200, vat_total: 23, total: 223 });
    expect(r.sumy.riadky[0]).toMatchObject({ prenesenie: true, vat_rate: 0 });
  });

  it("presné sumy z obchodu so zľavou alebo DPH pri prenesení odmietne", async () => {
    const { sumyFakturyApi } = await import("./api-sumy-riadkov");
    const presna = { quantity: 1, unit_price: 10, vat_rate: 23, subtotal: 10, vat_amount: 2.3 };
    expect(
      sumyFakturyApi([presna], { discount_type: "percent", discount_value: 5 }),
    ).toHaveProperty("chyba");
    expect(sumyFakturyApi([presna], { reverse_charge: true })).toHaveProperty("chyba");
    const r = sumyFakturyApi([{ ...presna, vat_rate: 0, vat_amount: 0 }], { reverse_charge: true });
    expect("sumy" in r && r.sumy.total).toBe(10);
  });
});
