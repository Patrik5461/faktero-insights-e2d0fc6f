import { describe, expect, it } from "vitest";
import {
  formatujSucetPoMenach,
  menaAleboDomaca,
  sucetPoMenach,
  sucetVDomacejMene,
  sumaVDomacejMene,
} from "./mena-sucet";
import { sumyPoMenach } from "./suhrn-vyberu";
import { sumyPodlaMeny } from "./ai-asistent-kontext";

const n = (s: string) => s.replace(/[\s  ]+/g, " ");

describe("sucetPoMenach", () => {
  const riadky = [
    { total: 100, currency: "CZK" },
    { total: "200.105", currency: "EUR" },
    { total: 50, currency: "czk" },
    { total: 10, currency: null },
    { total: "x", currency: "USD" },
    { total: 5, currency: "QA položka" },
  ];
  it("sčíta po menách, domáca prvá, prázdna/nezmyselná mena = domáca, nečíslo vynechá", () => {
    const m = sucetPoMenach(riadky, (r) => r.total, (r) => r.currency);
    expect([...m.entries()]).toEqual([
      ["EUR", 215.11],
      ["CZK", 150],
    ]);
  });
  it("pri CZK firme je domáca CZK a ide prvá", () => {
    const m = sucetPoMenach(riadky, (r) => r.total, (r) => r.currency, "CZK");
    expect([...m.keys()]).toEqual(["CZK", "EUR"]);
    expect(m.get("CZK")).toBe(165);
  });
  it("menaAleboDomaca", () => {
    expect(menaAleboDomaca(" usd ")).toBe("USD");
    expect(menaAleboDomaca("", "CZK")).toBe("CZK");
  });
});

describe("formatujSucetPoMenach", () => {
  it("„1 200,00 € · 3 400,00 Kč“", () => {
    const m = new Map([
      ["EUR", 1200],
      ["CZK", 3400],
    ]);
    expect(n(formatujSucetPoMenach(m))).toBe("1 200,00 € · 3 400,00 Kč");
  });
  it("prázdny súčet = nula v domácej mene", () => {
    expect(n(formatujSucetPoMenach(new Map(), "sk-SK", { domaca: "CZK" }))).toBe("0,00 Kč");
  });
  it("nulové meny vynechá, ale všetko nulové ukáže jednu nulu", () => {
    expect(n(formatujSucetPoMenach(new Map([["EUR", 0], ["USD", 5]]), "sk-SK"))).toBe("5,00 USD");
    expect(n(formatujSucetPoMenach(new Map([["EUR", 0], ["USD", 0]])))).toBe("0,00 €");
  });
  it("berie aj výstup sumyPoMenach (suhrn-vyberu) a sumyPodlaMeny (AI)", () => {
    const a = sumyPoMenach([
      { mena: "EUR", celkom: 10 },
      { mena: "CZK", celkom: 20 },
    ]);
    expect(n(formatujSucetPoMenach(a))).toBe("10,00 € · 20,00 Kč");
    const b = sumyPodlaMeny([{ total: 7, currency: "EUR" } as any]);
    expect(n(formatujSucetPoMenach(b))).toBe("7,00 €");
  });
  it("vlastný oddeľovač a nemecký locale", () => {
    expect(n(formatujSucetPoMenach(new Map([["EUR", 1], ["CZK", 2]]), "de-DE", { oddelovac: " + " }))).toBe(
      "1,00 € + 2,00 Kč",
    );
  });
});

describe("sumaVDomacejMene", () => {
  it("domáca mena bez prepočtu", () => {
    expect(sumaVDomacejMene({ suma: 10, mena: "EUR" }, "SK")).toEqual({ suma: 10, prepocitane: false });
    expect(sumaVDomacejMene({ suma: 10, mena: null }, "CZ")).toEqual({ suma: 10, prepocitane: false });
  });
  it("preferuje uloženú sumu *_eur", () => {
    expect(sumaVDomacejMene({ suma: 254, mena: "CZK", sumaDomaca: 10.01, kurz: 25 }, "SK")).toEqual({
      suma: 10.01,
      prepocitane: true,
    });
  });
  it("SK firma: kurz ECB X za 1 EUR → delí", () => {
    expect(sumaVDomacejMene({ suma: 254, mena: "CZK", kurz: 25.4 }, "SK")).toEqual({ suma: 10, prepocitane: true });
  });
  it("CZ firma: kurz ČNB CZK za 1 X → násobí", () => {
    expect(sumaVDomacejMene({ suma: 10, mena: "EUR", kurz: 25.4 }, "CZ")).toEqual({ suma: 254, prepocitane: true });
  });
  it("bez kurzu aj bez uloženej sumy → null (nikdy kurz 1)", () => {
    expect(sumaVDomacejMene({ suma: 10, mena: "USD" }, "SK")).toBeNull();
    expect(sumaVDomacejMene({ suma: 10, mena: "USD", kurz: 0, sumaDomaca: "" }, "SK")).toBeNull();
  });
});

describe("sucetVDomacejMene", () => {
  it("sčíta prepočítané, zvyšok bez kurzu po menách", () => {
    const s = sucetVDomacejMene(
      [
        { total: 100, currency: "EUR" },
        { total: 254, currency: "CZK", exchange_rate: 25.4 },
        { total: 30, currency: "USD" },
      ],
      (r) => ({ suma: r.total, mena: r.currency, kurz: (r as any).exchange_rate }),
      "SK",
    );
    expect(s.domaca).toBe("EUR");
    expect(s.suma).toBe(110);
    expect(s.prepocitane).toBe(true);
    expect([...s.bezPrepoctu.entries()]).toEqual([["USD", 30]]);
  });
  it("len domáca mena → nie je prepočítané", () => {
    const s = sucetVDomacejMene([{ s: 1 }, { s: 2 }], (r) => ({ suma: r.s }), "CZ");
    expect(s).toMatchObject({ domaca: "CZK", suma: 3, prepocitane: false });
    expect(s.bezPrepoctu.size).toBe(0);
  });
});
