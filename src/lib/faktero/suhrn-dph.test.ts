import { describe, expect, it } from "vitest";
import {
  maRozneSadzby,
  normalizujSuhrn,
  rozpisDokladu,
  suhrnVystavenych,
  suhrnZPoloziek,
  zapocitatVoZozname,
} from "./suhrn-dph";

const faktura = (o: Record<string, unknown> = {}) => ({
  type: "regular",
  status: "issued",
  currency: "EUR",
  subtotal: 100,
  vat_total: 23,
  total: 123,
  ...o,
});

describe("zapocitatVoZozname", () => {
  it("storno nikdy, koncept len v Konceptoch", () => {
    expect(zapocitatVoZozname(faktura({ status: "cancelled" }))).toBe(false);
    expect(zapocitatVoZozname(faktura({ status: "draft" }))).toBe(false);
    expect(zapocitatVoZozname(faktura({ status: "draft" }), { status: "draft" })).toBe(true);
  });

  it("zálohová a daňový doklad k platbe len vo vlastnej záložke", () => {
    expect(zapocitatVoZozname(faktura({ type: "proforma" }))).toBe(false);
    expect(zapocitatVoZozname(faktura({ type: "proforma" }), { typy: ["proforma"] })).toBe(true);
    expect(zapocitatVoZozname(faktura({ type: "advance_payment" }))).toBe(false);
    expect(
      zapocitatVoZozname(faktura({ type: "advance_payment" }), { typy: ["advance_payment"] }),
    ).toBe(true);
    // Zmiešaný filter typov zálohovú nepustí.
    expect(
      zapocitatVoZozname(faktura({ type: "proforma" }), { typy: ["proforma", "regular"] }),
    ).toBe(false);
  });

  it("vymazaná sa nepočíta", () => {
    expect(zapocitatVoZozname(faktura({ deleted_at: "2026-10-01" }))).toBe(false);
  });
});

describe("rozpisDokladu", () => {
  it("rozdelí podľa sadzieb", () => {
    const r = rozpisDokladu(faktura({ subtotal: 200, vat_total: 28, total: 228 }), [
      { vat_rate: 23, subtotal: 100, vat_amount: 23 },
      { vat_rate: 5, subtotal: 100, vat_amount: 5 },
    ]);
    expect(r).toEqual([
      { sadzba: 23, pdp: false, zaklad: 100, dph: 23 },
      { sadzba: 5, pdp: false, zaklad: 100, dph: 5 },
    ]);
  });

  it("zľavu na doklad z hlavičky rozpočíta pomerne", () => {
    // 10 % zľava na doklad: riadky 100 + 100, hlavička 180 / 25,20.
    const r = rozpisDokladu(faktura({ subtotal: 180, vat_total: 25.2, total: 205.2 }), [
      { vat_rate: 23, subtotal: 100, vat_amount: 23 },
      { vat_rate: 5, subtotal: 100, vat_amount: 5 },
    ]);
    expect(r[0].zaklad).toBeCloseTo(90);
    expect(r[0].dph).toBeCloseTo(20.7);
    expect(r[1].zaklad).toBeCloseTo(90);
    expect(r[1].dph).toBeCloseTo(4.5);
  });

  it("prenesenie daňovej povinnosti ide bez sadzby", () => {
    const r = rozpisDokladu(faktura({ reverse_charge: true, vat_total: 0, total: 100 }), [
      { vat_rate: 23, subtotal: 100, vat_amount: 0 },
    ]);
    expect(r).toEqual([{ sadzba: null, pdp: true, zaklad: 100, dph: 0 }]);
  });

  it("doklad bez položiek ide celý do riadku bez sadzby", () => {
    expect(rozpisDokladu(faktura())).toEqual([{ sadzba: null, pdp: false, zaklad: 100, dph: 23 }]);
  });
});

describe("suhrnVystavenych", () => {
  it("sčíta po menách a sadzbách, meny nemieša", () => {
    const s = suhrnVystavenych([
      { ...faktura(), polozky: [{ vat_rate: 23, subtotal: 100, vat_amount: 23 }] },
      {
        ...faktura({ subtotal: 50, vat_total: 2.5, total: 52.5 }),
        polozky: [{ vat_rate: 5, subtotal: 50, vat_amount: 2.5 }],
      },
      {
        ...faktura({ currency: "czk", subtotal: 1000, vat_total: 210, total: 1210 }),
        polozky: [{ vat_rate: 21, subtotal: 1000, vat_amount: 210 }],
      },
    ]);
    expect(s.pocet).toBe(3);
    expect(s.mimo).toBe(0);
    expect(s.meny.map((m) => m.mena)).toEqual(["EUR", "CZK"]);
    const eur = s.meny[0];
    expect(eur).toMatchObject({ pocet: 2, zaklad: 150, dph: 25.5, celkom: 175.5 });
    expect(eur.sadzby.map((x) => x.sadzba)).toEqual([23, 5]);
    expect(eur.sadzby[1]).toMatchObject({ zaklad: 50, dph: 2.5, celkom: 52.5 });
    expect(maRozneSadzby(eur)).toBe(true);
    expect(maRozneSadzby(s.meny[1])).toBe(false);
    expect(s.meny[1]).toMatchObject({ zaklad: 1000, dph: 210, celkom: 1210 });
  });

  it("dobropis odpočítava — záporne uložený aj kladne uložený", () => {
    const polozky = [{ vat_rate: 23, subtotal: 100, vat_amount: 23 }];
    const s = suhrnVystavenych([
      {
        ...faktura({ subtotal: 200, vat_total: 46, total: 246 }),
        polozky: [{ vat_rate: 23, subtotal: 200, vat_amount: 46 }],
      },
      {
        ...faktura({ type: "credit_note", subtotal: -100, vat_total: -23, total: -123 }),
        polozky: [{ vat_rate: 23, subtotal: -100, vat_amount: -23 }],
      },
      // Starší import uložil dobropis kladne — otočí sa.
      { ...faktura({ type: "credit_note" }), polozky },
    ]);
    expect(s.meny[0]).toMatchObject({ zaklad: 0, dph: 0, celkom: 0 });
    expect(s.meny[0].sadzby).toEqual([{ sadzba: 23, pdp: false, zaklad: 0, dph: 0, celkom: 0 }]);
  });

  it("zálohovú, storno a koncept v spoločnom zozname nepočíta", () => {
    const s = suhrnVystavenych([
      faktura(),
      faktura({ type: "proforma" }),
      faktura({ type: "advance_payment" }),
      faktura({ status: "cancelled" }),
      faktura({ status: "draft" }),
    ]);
    expect(s.pocet).toBe(5);
    expect(s.mimo).toBe(4);
    expect(s.meny[0]).toMatchObject({ pocet: 1, zaklad: 100, dph: 23, celkom: 123 });
  });

  it("v záložke zálohových zálohovú počíta", () => {
    const s = suhrnVystavenych([faktura({ type: "proforma" })], { typy: ["proforma"] });
    expect(s.mimo).toBe(0);
    expect(s.meny[0].celkom).toBe(123);
  });
});

describe("normalizujSuhrn", () => {
  it("prevedie odpoveď databázy a zoradí sadzby", () => {
    const s = normalizujSuhrn({
      pocet: "3",
      mimo: 1,
      meny: [
        { mena: "USD", pocet: 1, zaklad: "10", dph: "0", celkom: "10", sadzby: [] },
        {
          mena: "EUR",
          pocet: 1,
          zaklad: 100,
          dph: 10,
          celkom: 110,
          sadzby: [
            { sadzba: null, pdp: true, zaklad: 50, dph: 0, celkom: 50 },
            { sadzba: 5, pdp: false, zaklad: 20, dph: 1, celkom: 21 },
            { sadzba: "23", pdp: false, zaklad: 30, dph: 9, celkom: 39 },
          ],
        },
      ],
    });
    expect(s.pocet).toBe(3);
    expect(s.meny.map((m) => m.mena)).toEqual(["EUR", "USD"]);
    expect(s.meny[0].sadzby.map((x) => [x.sadzba, x.pdp])).toEqual([
      [23, false],
      [5, false],
      [null, true],
    ]);
    expect(s.meny[1].zaklad).toBe(10);
  });

  it("prázdna odpoveď nič nespadne", () => {
    expect(normalizujSuhrn(null)).toEqual({ pocet: 0, mimo: 0, meny: [] });
  });
});

describe("suhrnZPoloziek", () => {
  it("prijaté: základ a DPH po menách, zálohová mimo", () => {
    const s = suhrnZPoloziek([
      { mena: "EUR", celkom: 123, bezDph: 100 },
      { mena: "EUR", celkom: -12.3, bezDph: -10 },
      { mena: "EUR", celkom: 50, bezDph: 50, typ: "proforma" },
      { mena: "CZK", celkom: 121, bezDph: 100 },
    ]);
    expect(s.mimo).toBe(1);
    expect(s.meny[0]).toMatchObject({
      mena: "EUR",
      pocet: 2,
      zaklad: 90,
      dph: 20.7,
      celkom: 110.7,
    });
    expect(s.meny[1]).toMatchObject({ mena: "CZK", pocet: 1, zaklad: 100, dph: 21 });
  });

  it("chýbajúci základ nesčíta ani DPH", () => {
    const s = suhrnZPoloziek([
      { mena: "EUR", celkom: 10, bezDph: null },
      { mena: "EUR", celkom: 20, bezDph: 16 },
    ]);
    expect(s.meny[0]).toMatchObject({ zaklad: null, dph: null, celkom: 30 });
  });
});
