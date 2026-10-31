import { describe, expect, it } from "vitest";
import { sumyVystavenej, vstupPrehladu, vystupPrehladu } from "./dph-prehlad";

const faktura = {
  id: "f1",
  type: "regular",
  subtotal: 1000,
  vat_total: 230,
  total: 1230,
};
// Dobropis tak, ako ho uloží formulár — záporné sumy aj množstvo.
const dobropis = {
  id: "d1",
  type: "credit_note",
  subtotal: -200,
  vat_total: -46,
  total: -246,
};
// Starší import uložil dobropis kladne.
const dobropisKladny = {
  id: "d2",
  type: "credit_note",
  subtotal: 100,
  vat_total: 23,
  total: 123,
};
const polozky = [
  { invoice_id: "f1", subtotal: 1000, vat_amount: 230, vat_rate: 23 },
  { invoice_id: "d1", subtotal: -200, vat_amount: -46, vat_rate: 23 },
  { invoice_id: "d2", subtotal: 100, vat_amount: 23, vat_rate: 23 },
];

describe("DPH prehľad — dobropis", () => {
  it("v zozname dokladov je dobropis záporný bez ohľadu na to, ako je uložený", () => {
    expect(sumyVystavenej(dobropis)).toEqual({ zaklad: -200, dph: -46, spolu: -246 });
    expect(sumyVystavenej(dobropisKladny)).toEqual({ zaklad: -100, dph: -23, spolu: -123 });
    expect(sumyVystavenej(faktura)).toEqual({ zaklad: 1000, dph: 230, spolu: 1230 });
  });

  it("súčet sadzby = súčet riadkov zoznamu (dobropis znižuje základ aj daň)", () => {
    const b = vystupPrehladu([faktura, dobropis, dobropisKladny], polozky);
    expect(b["23"].base).toBe(700);
    expect(b["23"].vat).toBe(161);
    expect(b["23"].count).toBe(3);
    const zoZoznamu = [faktura, dobropis, dobropisKladny]
      .map(sumyVystavenej)
      .reduce((a, s) => ({ z: a.z + s.zaklad, d: a.d + s.dph }), { z: 0, d: 0 });
    expect(zoZoznamu).toEqual({ z: 700, d: 161 });
  });

  it("prijatý dobropis ostane pri svojej sadzbe, nie medzi oslobodenými", () => {
    const b = vstupPrehladu(
      [
        { id: "p1", amount_without_vat: 100, vat_amount: 23 },
        { id: "p2", amount_without_vat: -10, vat_amount: -2.3 },
      ],
      "SK",
    );
    expect(b["23"].base).toBe(90);
    expect(b["23"].vat).toBeCloseTo(20.7, 10);
    expect(b["23"].count).toBe(2);
    expect(b.exempt.count).toBe(0);
  });

  it("nulová DPH a zmiešané znamienka sa nezaradia k sadzbe", () => {
    const b = vstupPrehladu(
      [
        { id: "p1", amount_without_vat: -50, vat_amount: 0 },
        { id: "p2", amount_without_vat: 0, vat_amount: 5 },
      ],
      "SK",
    );
    expect(b["0"].base).toBe(-50);
    expect(b.exempt.vat).toBe(5);
  });
});
