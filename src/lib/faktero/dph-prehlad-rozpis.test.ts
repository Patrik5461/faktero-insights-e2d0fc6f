/*
  Prehľad DPH (uctovnictvo.dph) a uložený rozpis prijatej faktúry
  (`purchase_invoices.vat_breakdown`, 2026-11-05): viac sadzieb nesmie
  splynúť do jednej „priemernej“ a „Nie je predmetom DPH“ sa vynechá.
*/
import { describe, expect, it } from "vitest";
import { vstupPrehladu } from "./dph-prehlad";
import { rozpisPrijatej } from "./prijate-do-pohody";

describe("vstupPrehladu s vat_breakdown", () => {
  it("fixture 1: 0 % + 23 % namiesto 19 %", () => {
    const b = vstupPrehladu(
      [
        {
          id: "p1",
          amount_without_vat: 143.77,
          vat_amount: 26.88,
          currency: "EUR",
          vat_breakdown: [
            { sadzba: 0, zaklad: 26.9, dph: 0, vat_category: "exempt" },
            { sadzba: 23, zaklad: 116.87, dph: 26.88, vat_category: "standard" },
          ],
        },
      ],
      "SK",
    );
    expect(b["23"]?.base).toBeCloseTo(116.87);
    expect(b["23"]?.vat).toBeCloseTo(26.88);
    expect(b["0"]?.base).toBeCloseTo(26.9);
    expect(b["19"]).toBeUndefined();
  });

  it("fixture 2: „nie je predmetom DPH“ sa do prehľadu nedostane", () => {
    const b = vstupPrehladu(
      [
        {
          id: "p2",
          amount_without_vat: 384.39,
          vat_amount: 5.61,
          currency: "EUR",
          vat_breakdown: [
            { sadzba: 0, zaklad: 360, dph: 0, vat_category: "out_of_scope" },
            { sadzba: 23, zaklad: 24.39, dph: 5.61, vat_category: "standard" },
          ],
        },
      ],
      "SK",
    );
    expect(b["23"]?.base).toBeCloseTo(24.39);
    expect(b["0"]).toBeUndefined();
  });

  it("rozpis, ktorý nesedí so sumami, sa ignoruje (pomer ako doteraz)", () => {
    const b = vstupPrehladu(
      [
        {
          id: "p3",
          amount_without_vat: 100,
          vat_amount: 23,
          currency: "EUR",
          vat_breakdown: [{ sadzba: 5, zaklad: 50, dph: 2.5 }],
        },
      ],
      "SK",
    );
    expect(b["23"]?.base).toBeCloseTo(100);
  });
});

describe("rozpisPrijatej s vat_breakdown", () => {
  it("vat_breakdown má prednosť pred položkami a nesie kategóriu", () => {
    const r = rozpisPrijatej({
      amount_without_vat: 384.39,
      vat_amount: 5.61,
      amount_total: 390,
      items: [{ name: "všetko", vat_rate: 23, total: 384.39 }],
      vat_breakdown: [
        { sadzba: 0, zaklad: 360, dph: 0, vat_category: "out_of_scope" },
        { sadzba: 23, zaklad: 24.39, dph: 5.61, vat_category: "standard" },
      ],
    });
    expect(r).toEqual([
      { sadzba: 0, zaklad: 360, dph: 0, vat_category: "out_of_scope" },
      { sadzba: 23, zaklad: 24.39, dph: 5.61, vat_category: "standard" },
    ]);
  });
  it("reverse_charge → pdp", () => {
    const r = rozpisPrijatej({
      amount_without_vat: 1000,
      vat_amount: 0,
      amount_total: 1000,
      vat_breakdown: [{ sadzba: 23, zaklad: 1000, dph: 0, vat_category: "reverse_charge" }],
    });
    expect(r[0]).toMatchObject({ pdp: true, vat_category: "reverse_charge" });
  });
});
