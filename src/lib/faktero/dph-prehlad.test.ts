import { describe, expect, it } from "vitest";
import { dokladyBezPrepoctu, sumyVystavenej, vstupPrehladu, vystupPrehladu } from "./dph-prehlad";

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

describe("DPH prehľad — meny (B-13)", () => {
  // SK firma: EUR doma, USD s kurzom ECB 1,10 (USD za 1 EUR), CZK s kurzom 25, dobropis v CZK.
  const sk = [
    { id: "e", type: "regular", total: 123, subtotal: 100, vat_total: 23, currency: "EUR" },
    {
      id: "u",
      type: "regular",
      total: 1100,
      subtotal: 1100,
      vat_total: 0,
      currency: "USD",
      exchange_rate: 1.1,
      reverse_charge: true,
    },
    {
      id: "c",
      type: "regular",
      total: 3075,
      subtotal: 2500,
      vat_total: 575,
      currency: "CZK",
      exchange_rate: 25,
    },
    {
      id: "cd",
      type: "credit_note",
      total: -615,
      subtotal: -500,
      vat_total: -115,
      currency: "CZK",
      exchange_rate: 25,
    },
    {
      id: "bez",
      type: "regular",
      total: 50,
      subtotal: 50,
      vat_total: 0,
      currency: "PLN",
      exchange_rate: null,
    },
  ];
  const pol = [
    { invoice_id: "e", subtotal: 100, vat_amount: 23, vat_rate: 23 },
    { invoice_id: "u", subtotal: 1100, vat_amount: 0, vat_rate: 0 },
    { invoice_id: "c", subtotal: 2500, vat_amount: 575, vat_rate: 23 },
    { invoice_id: "cd", subtotal: -500, vat_amount: -115, vat_rate: 23 },
    { invoice_id: "bez", subtotal: 50, vat_amount: 0, vat_rate: 0 },
  ];

  it("SK firma: cudzie meny prepočíta kurzom ECB dokladu, dobropis odpočíta", () => {
    const b = vystupPrehladu(sk, pol, "SK");
    // 100 € + 2 500 CZK / 25 − 500 CZK / 25 = 100 + 100 − 20
    expect(b["23"].base).toBeCloseTo(180, 2);
    expect(b["23"].vat).toBeCloseTo(23 + 23 - 4.6, 2);
    expect(b.pdp.base).toBeCloseTo(1000, 2);
    // PLN bez kurzu nie je v súčtoch ani v počte
    expect(b["0"]?.count ?? 0).toBe(0);
  });

  it("doklady v cudzej mene bez kurzu vráti zvlášť", () => {
    const prijate = [
      { id: "p1", amount_without_vat: 100, vat_amount: 23, currency: "EUR" },
      { id: "p2", amount_without_vat: 400, vat_amount: 84, currency: "CZK" },
      {
        id: "p3",
        amount_without_vat: 400,
        vat_amount: 84,
        currency: "CZK",
        amount_without_vat_eur: 16,
        vat_amount_eur: 3.36,
      },
    ];
    expect(dokladyBezPrepoctu(sk, prijate, "SK")).toEqual([
      { id: "bez", druh: "vystavena", mena: "PLN" },
      { id: "p2", druh: "prijata", mena: "CZK" },
    ]);
    const vstup = vstupPrehladu(prijate, "SK");
    expect(vstup["23"].base).toBeCloseTo(100, 2);
    // p2 (CZK bez prepočtu) v súčte nie je, p3 ide v eurách (16 €)
    const spolu = Object.values(vstup).reduce((a, r) => a + r.base, 0);
    expect(spolu).toBeCloseTo(116, 2);
  });

  it("CZ firma: CZK je domáca, EUR sa násobí kurzom ČNB", () => {
    const cz = [
      { id: "k", type: "regular", total: 1210, subtotal: 1000, vat_total: 210, currency: "CZK" },
      {
        id: "eu",
        type: "regular",
        total: 121,
        subtotal: 100,
        vat_total: 21,
        currency: "EUR",
        exchange_rate: 25,
      },
    ];
    const b = vystupPrehladu(
      cz,
      [
        { invoice_id: "k", subtotal: 1000, vat_amount: 210, vat_rate: 21 },
        { invoice_id: "eu", subtotal: 100, vat_amount: 21, vat_rate: 21 },
      ],
      "CZ",
    );
    expect(b["21"].base).toBeCloseTo(3500, 2);
    expect(b["21"].vat).toBeCloseTo(735, 2);
    expect(dokladyBezPrepoctu(cz, [], "CZ")).toEqual([]);
  });

  it("bežná SK firma len v EUR: výsledok rovnaký ako bez krajiny", () => {
    const eur = [faktura, dobropis, dobropisKladny];
    expect(vystupPrehladu(eur, polozky, "SK")).toEqual(vystupPrehladu(eur, polozky));
  });
});
