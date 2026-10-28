import { describe, expect, it } from "vitest";
import {
  polozkaBlocku,
  polozkaNespracovaneho,
  polozkaPrijatej,
  polozkaVystavenej,
  suhrnVyberu,
  sumyPoMenach,
} from "./suhrn-vyberu";
import { ZAPLATENE_NA_MIESTE } from "./hromadny-prikaz";
import { naUhraduZNespracovaneho } from "./nespracovane";

describe("sumyPoMenach", () => {
  it("meny nesčítava a zálohovú vynechá", () => {
    const s = sumyPoMenach([
      { mena: "EUR", celkom: 123, bezDph: 100 },
      { mena: "CZK", celkom: 1210, bezDph: 1000 },
      { mena: "EUR", celkom: 50, bezDph: 40, typ: "proforma" },
      { mena: null, celkom: 24.6, bezDph: 20 },
    ]);
    expect(s).toEqual([
      { mena: "EUR", celkom: 147.6, bezDph: 120 },
      { mena: "CZK", celkom: 1210, bezDph: 1000 },
    ]);
  });

  it("dobropis odpočíta — záporne uložený aj kladne uložený", () => {
    const s = sumyPoMenach([
      { celkom: 100, bezDph: 81.3 },
      { celkom: -20, bezDph: -16.26, typ: "credit_note" },
      { celkom: 10, bezDph: 8.13, typ: "credit_note" },
    ]);
    expect(s).toEqual([{ mena: "EUR", celkom: 70, bezDph: 56.91 }]);
  });

  it("bez DPH sa nesčíta, keď niektorému dokladu chýba", () => {
    expect(
      sumyPoMenach([
        { celkom: 10, bezDph: 8 },
        { celkom: 5, bezDph: null },
      ])[0].bezDph,
    ).toBeNull();
  });
});

describe("suhrnVyberu", () => {
  it("zálohová na úhradu ide, do súčtu nie", () => {
    const s = suhrnVyberu([
      { celkom: 100, bezDph: 100, naUhradu: true, naExport: true },
      { celkom: 50, bezDph: 50, typ: "proforma", naUhradu: true },
    ]);
    expect(s.pocet).toBe(2);
    expect(s.mimoSuctu).toBe(1);
    expect(s.spolu[0].celkom).toBe(100);
    expect(s.naExport).toEqual({ pocet: 1, sumy: [{ mena: "EUR", celkom: 100, bezDph: 100 }] });
    expect(s.naUhradu.pocet).toBe(2);
    expect(s.naUhradu.sumy[0].celkom).toBe(150);
  });
});

describe("agendy", () => {
  it("prijatá: zaplatená, hotovosť a dobropis nie sú na úhradu", () => {
    const o = { zaplateneNaMieste: ZAPLATENE_NA_MIESTE };
    expect(polozkaPrijatej({ status: "received", amount_total: 10 }, o).naUhradu).toBe(true);
    expect(polozkaPrijatej({ status: "paid", amount_total: 10 }, o).naUhradu).toBe(false);
    expect(
      polozkaPrijatej({ status: "received", amount_total: 10, payment_method: "hotovost" }, o)
        .naUhradu,
    ).toBe(false);
    expect(polozkaPrijatej({ status: "received", amount_total: -10 }, o).naUhradu).toBe(false);
    expect(
      polozkaPrijatej({ status: "booked", amount_total: 10, exported_at: "2026-10-01" }, o)
        .naExport,
    ).toBe(false);
    expect(
      polozkaPrijatej({ status: "booked", amount_total: 10 }, { zapocitatelna: false }).naUhradu,
    ).toBe(false);
  });

  it("vystavená: dobropis a zaplatená nie sú na úhradu, koncept nie je na export", () => {
    expect(polozkaVystavenej({ status: "issued", type: "regular", total: 10 }).naUhradu).toBe(true);
    expect(polozkaVystavenej({ status: "issued", type: "credit_note", total: -10 }).naUhradu).toBe(
      false,
    );
    expect(polozkaVystavenej({ status: "paid", type: "regular", paid_at: "x" }).naUhradu).toBe(
      false,
    );
    expect(polozkaVystavenej({ status: "draft", type: "regular" }).naExport).toBe(false);
    expect(polozkaVystavenej({ status: "cancelled", type: "regular" }).mimoSuctu).toBe(true);
  });

  it("bloček: na úhradu len prevod bez spárovanej platby", () => {
    expect(polozkaBlocku({ payment_method: "prevod" }, false).naUhradu).toBe(true);
    expect(polozkaBlocku({ payment_method: "prevod" }, true).naUhradu).toBe(false);
    expect(polozkaBlocku({ payment_method: "karta" }, false).naUhradu).toBe(false);
    expect(polozkaBlocku({ status: "processed" }, false).naExport).toBe(true);
    expect(polozkaBlocku({ status: "new" }, false).naExport).toBe(false);
  });

  it("nespracovaný: dobropis odpočíta, iný doklad mimo súčtu, nezaúčtovaný = na export", () => {
    const s = suhrnVyberu([
      polozkaNespracovaneho({ druh: "faktura", suma: 100, zaklad: 81.3 }),
      polozkaNespracovaneho({ druh: "dobropis", suma: 20, zaklad: 16.26, predkontacia: "P01" }),
      polozkaNespracovaneho({ druh: "ostatny", suma: 999 }),
    ]);
    expect(s.spolu).toEqual([{ mena: "EUR", celkom: 80, bezDph: 65.04 }]);
    expect(s.mimoSuctu).toBe(1);
    expect(s.naExport.pocet).toBe(1);
    expect(s.naUhradu.pocet).toBe(1);
  });
});

describe("naUhraduZNespracovaneho", () => {
  it("berie IBAN, VS a sumu z uložených údajov", () => {
    const f = naUhraduZNespracovaneho(
      {
        id: "a",
        druh: "faktura",
        udaje: {
          cislo: "2026001",
          vs: "2026001",
          dodavatel: { nazov: "Dodávateľ s.r.o.", iban: "SK3112000000198742637541" },
          rozpis: [{ sadzba: 23, zaklad: 100, dph: 23 }],
          celkom: null,
          splatnost: "2026-11-10",
        },
      },
      "2026-10-28",
    );
    expect(f).toMatchObject({
      supplier_iban: "SK3112000000198742637541",
      variable_symbol: "2026001",
      amount_total: 123,
      due_date: "2026-11-10",
      dovod: null,
    });
  });

  it("bez uložených údajov vezme vyťaženie, dobropis vráti dôvod", () => {
    const f = naUhraduZNespracovaneho(
      {
        id: "b",
        druh: "dobropis",
        udaje: {},
        ai: {
          supplier_name: "X",
          supplier_iban: "SK31 1200 0000 1987 4263 7541",
          amount_total: 50,
        },
      },
      "2026-10-28",
    );
    expect(f.supplier_iban).toBe("SK3112000000198742637541");
    expect(f.dovod).toMatch(/dobropis/);
  });
});
