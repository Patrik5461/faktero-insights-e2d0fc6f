import { describe, expect, it } from "vitest";
import { ustva, ustvaNaCsv } from "./ustva";
import type { PrijataFaktura, Vstup, VystavenaFaktura } from "./dph-vykazy";

const obdobie = { rok: 2026, mesiac: 10 };

function vstup(c: Partial<Vstup>): Vstup {
  return { obdobie, vystavene: [], prijate: [], doklady: [], ...c };
}
const fa = (x: Partial<VystavenaFaktura>): VystavenaFaktura => ({
  cislo: "RE-1",
  typ: "regular",
  datumDodania: "2026-10-05",
  riadky: [],
  ...x,
});
const pf = (x: Partial<PrijataFaktura>): PrijataFaktura => ({
  cislo: "ER-1",
  datumDodania: "2026-10-05",
  rezim: "tuzemsko",
  odpocet: true,
  riadky: [],
  ...x,
});

describe("UStVA", () => {
  it("KZ 81 / 86 v celých eurách, daň z formulára, dobropis odpočíta", () => {
    const u = ustva(
      vstup({
        vystavene: [
          fa({ riadky: [{ sadzba: 19, zaklad: 1000.99, dan: 190.19 }] }),
          fa({ cislo: "RE-2", riadky: [{ sadzba: 7, zaklad: 200, dan: 14 }] }),
          fa({
            cislo: "GS-1",
            typ: "credit_note",
            riadky: [{ sadzba: 19, zaklad: -100, dan: -19 }],
          }),
          fa({
            cislo: "ZF-1",
            typ: "proforma",
            riadky: [{ sadzba: 19, zaklad: 999, dan: 189.81 }],
          }),
          fa({ cislo: "OSS", oss: true, riadky: [{ sadzba: 20, zaklad: 50, dan: 10 }] }),
        ],
      }),
    );
    expect(u.kz["81"]).toBe(900);
    expect(u.danKZakladu["81"]).toBe(171);
    expect(u.kz["86"]).toBe(200);
    expect(u.danKZakladu["86"]).toBe(14);
    expect(u.danSpolu).toBe(185);
    expect(u.kz["83"]).toBe(185);
    expect(u.kz["35"]).toBeUndefined();
  });

  it("EÚ a vývoz: KZ 41, 21, 42, 43, 45 a tuzemské prenesenie KZ 60", () => {
    const u = ustva(
      vstup({
        vystavene: [
          fa({
            prenosDane: true,
            prenosTyp: "eu_b2b",
            euPlnenie: "tovar",
            odberatelIcDph: "ATU12345678",
            riadky: [{ sadzba: 0, zaklad: 1000, dan: 0 }],
          }),
          fa({
            prenosDane: true,
            prenosTyp: "eu_b2b",
            euPlnenie: "sluzba",
            odberatelIcDph: "FR12345678901",
            riadky: [{ sadzba: 0, zaklad: 300.5, dan: 0 }],
          }),
          fa({
            prenosDane: true,
            prenosTyp: "eu_b2b",
            euPlnenie: "trojstranny",
            odberatelIcDph: "PL1234567890",
            riadky: [{ sadzba: 0, zaklad: 50, dan: 0 }],
          }),
          fa({
            prenosDane: true,
            prenosTyp: "export",
            riadky: [{ sadzba: 0, zaklad: 400, dan: 0 }],
          }),
          fa({
            prenosDane: true,
            prenosTyp: "export",
            euPlnenie: "sluzba",
            riadky: [{ sadzba: 0, zaklad: 70, dan: 0 }],
          }),
          fa({
            prenosDane: true,
            prenosTyp: "domestic_69",
            riadky: [{ sadzba: 0, zaklad: 2000, dan: 0 }],
          }),
        ],
      }),
    );
    expect(u.kz).toMatchObject({
      "41": 1000,
      "21": 300,
      "42": 50,
      "43": 400,
      "45": 70,
      "60": 2000,
    });
    expect(u.vytky).toEqual([]);
    expect(u.kz["83"]).toBe(0);
  });

  it("dodanie do EÚ bez cudzieho IČ DPH je výtka", () => {
    const u = ustva(
      vstup({
        vystavene: [
          fa({
            prenosDane: true,
            prenosTyp: "eu_b2b",
            odberatelIcDph: "DE123456789",
            riadky: [{ sadzba: 0, zaklad: 10, dan: 0 }],
          }),
        ],
      }),
    );
    expect(u.vytky).toHaveLength(1);
  });

  it("Vorsteuer: tuzemsko KZ 66 (aj bločky, pomer), dovoz KZ 62, bez odpočtu nič", () => {
    const u = ustva(
      vstup({
        prijate: [
          pf({ riadky: [{ sadzba: 19, zaklad: 100, dan: 19 }] }),
          pf({ cislo: "ER-2", riadky: [{ sadzba: 5, zaklad: 100, dan: 7 }] }),
          pf({ cislo: "ER-3", odpocet: false, riadky: [{ sadzba: 19, zaklad: 100, dan: 19 }] }),
          pf({ cislo: "EUSt", rezim: "dovoz", riadky: [{ sadzba: 19, zaklad: 500, dan: 95 }] }),
        ],
        doklady: [
          { odpocet: true, riadky: [{ sadzba: 19, zaklad: 50, dan: 9.5 }] },
          { odpocet: true, podielOdpoctu: 0.5, riadky: [{ sadzba: 19, zaklad: 100, dan: 19 }] },
        ],
      }),
    );
    expect(u.kz["66"]).toBe(45);
    expect(u.kz["62"]).toBe(95);
    expect(u.vorsteuerSpolu).toBe(140);
    expect(u.kz["83"]).toBe(-140);
  });

  it("nadobudnutie z EÚ KZ 89/93 + 61, služba z EÚ KZ 46/47 + 67, tuzemský § 13b KZ 84/85", () => {
    const u = ustva(
      vstup({
        prijate: [
          pf({
            rezim: "nadobudnutie",
            dodavatelIcDph: "SK2020123456",
            riadky: [{ sadzba: 0, zaklad: 1000, dan: 0 }],
          }),
          pf({
            rezim: "nadobudnutie",
            dodavatelIcDph: "AT U12345678",
            riadky: [{ sadzba: 7, zaklad: 100, dan: 7 }],
          }),
          pf({
            rezim: "samozdanenie",
            dodavatelIcDph: "IE1234567T",
            riadky: [{ sadzba: 0, zaklad: 200, dan: 0 }],
          }),
          pf({
            rezim: "samozdanenie",
            dodavatelIcDph: "DE111111111",
            riadky: [{ sadzba: 19, zaklad: 300, dan: 57 }],
          }),
          pf({
            rezim: "samozdanenie",
            dodavatelIcDph: null,
            odpocet: false,
            riadky: [{ sadzba: 0, zaklad: 100, dan: 0 }],
          }),
        ],
      }),
    );
    expect(u.kz["89"]).toBe(1000);
    expect(u.danKZakladu["89"]).toBe(190);
    expect(u.kz["93"]).toBe(100);
    expect(u.danKZakladu["93"]).toBe(7);
    expect(u.kz["61"]).toBe(197);
    expect(u.kz["46"]).toBe(200);
    expect(u.kz["47"]).toBe(38);
    expect(u.kz["84"]).toBe(400);
    expect(u.kz["85"]).toBe(76);
    // Bez odpočtu sa daň platí, ale neodpočíta: 76 − 57 = 19.
    expect(u.kz["67"]).toBe(95);
    expect(u.danSpolu).toBe(311);
    expect(u.vorsteuerSpolu).toBe(292);
    expect(u.kz["83"]).toBe(19);
  });

  it("ručné riadky: Sondervorauszahlung KZ 39 zníži KZ 83", () => {
    const u = ustva(
      vstup({ vystavene: [fa({ riadky: [{ sadzba: 19, zaklad: 1000, dan: 190 }] })] }),
      { "39": 50 },
    );
    expect(u.kz["83"]).toBe(140);
  });

  it("nulová sadzba bez prenesenia je výtka, iná sadzba ide do KZ 35/36", () => {
    const u = ustva(
      vstup({
        vystavene: [
          fa({ riadky: [{ sadzba: 0, zaklad: 10, dan: 0 }] }),
          fa({ cislo: "RE-16", riadky: [{ sadzba: 16, zaklad: 100, dan: 16 }] }),
        ],
      }),
    );
    expect(u.vytky).toHaveLength(1);
    expect(u.kz["35"]).toBe(100);
    expect(u.kz["36"]).toBe(16);
  });

  it("CSV s desatinnou čiarkou a KZ 83", () => {
    const u = ustva(vstup({ vystavene: [fa({ riadky: [{ sadzba: 19, zaklad: 100, dan: 19 }] })] }));
    const csv = ustvaNaCsv(u, (x) => x, { firma: "Muster GmbH", obdobie: "10/2026" });
    const r = csv.trim().split("\r\n");
    expect(r[0]).toBe("UStVA;Muster GmbH;10/2026");
    expect(r).toContain("81;Zdaniteľné plnenia 19 %;100,00;19,00");
    expect(r[r.length - 1]).toMatch(/^83;.*;;19,00$/);
  });
});
