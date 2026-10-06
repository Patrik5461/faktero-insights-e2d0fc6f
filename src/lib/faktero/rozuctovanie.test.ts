import { describe, expect, it } from "vitest";
import {
  chybaRozuctovania,
  dorovnaj,
  ocisti,
  rozpisBlocku,
  zaciatokRozuctovania,
  zostava,
} from "./rozuctovanie";

const rozpis = [
  { sadzba: 23, zaklad: 100, dph: 23 },
  { sadzba: 5, zaklad: 10, dph: 0.5 },
];

describe("rozúčtovanie", () => {
  it("sedí, keď súčty po sadzbách dajú doklad", () => {
    const r = [
      { predkontacia: "1Fp", clenenie: "PD", sadzba: 23, zaklad: 80, dph: 18.4 },
      { predkontacia: "2Fp", clenenie: "PN", sadzba: 23, zaklad: 20, dph: 4.6 },
      { predkontacia: "1Fp", clenenie: "PD", sadzba: 5, zaklad: 10, dph: 0.5 },
    ];
    expect(chybaRozuctovania(r, rozpis)).toBeNull();
  });

  it("povie, koľko chýba a v ktorej sadzbe", () => {
    const r = [
      { predkontacia: "1Fp", clenenie: "PD", sadzba: 23, zaklad: 80, dph: 18.4 },
      { predkontacia: "2Fp", clenenie: "PN", sadzba: 5, zaklad: 10, dph: 0.5 },
    ];
    expect(chybaRozuctovania(r, rozpis)).toMatch(/23 % — chýba základ 20.00, DPH 4.60/);
  });

  it("odmietne sadzbu, ktorá na doklade nie je, a riadok bez kódov", () => {
    const zlaSadzba = [
      { predkontacia: "1Fp", clenenie: null, sadzba: 19, zaklad: 1, dph: 0.19 },
      { predkontacia: "1Fp", clenenie: null, sadzba: 23, zaklad: 1, dph: 0.23 },
    ];
    expect(chybaRozuctovania(zlaSadzba, rozpis)).toMatch(/sadzba 19 %/);
    const bezKodu = [
      { predkontacia: "", clenenie: "", sadzba: 23, zaklad: 100, dph: 23 },
      { predkontacia: "1Fp", clenenie: null, sadzba: 5, zaklad: 10, dph: 0.5 },
    ];
    expect(chybaRozuctovania(bezKodu, rozpis)).toMatch(/Riadok 1/);
  });

  it("jeden riadok nie je rozúčtovanie, prázdne je v poriadku", () => {
    expect(chybaRozuctovania([], rozpis)).toBeNull();
    expect(chybaRozuctovania([{ predkontacia: "1Fp", clenenie: null, sadzba: 23, zaklad: 100, dph: 23 }], [rozpis[0]])).toMatch(/dva riadky/);
  });

  it("začiatok pri jednej sadzbe rozdelí na dva riadky, ktoré sedia", () => {
    const z = zaciatokRozuctovania([{ sadzba: 23, zaklad: 10.01, dph: 2.3 }], { predkontacia: "1Fp", clenenie: "PD" });
    expect(z).toHaveLength(2);
    expect(z[1].predkontacia).toBe("");
    expect(zostava(z, [{ sadzba: 23, zaklad: 10.01, dph: 2.3 }])).toEqual([{ sadzba: 23, zaklad: 0, dph: 0 }]);
  });

  it("začiatok pri viacerých sadzbách dá riadok na sadzbu", () => {
    const z = zaciatokRozuctovania(rozpis, { predkontacia: "1Fp", clenenie: "PD" });
    expect(z.map((x) => x.sadzba)).toEqual([23, 5]);
    expect(chybaRozuctovania(z, rozpis)).toBeNull();
  });

  it("dorovnanie doplní centy do vybraného riadku", () => {
    const r = [
      { predkontacia: "1Fp", clenenie: "PD", sadzba: 23, zaklad: 33.33, dph: 7.67 },
      { predkontacia: "2Fp", clenenie: "PD", sadzba: 23, zaklad: 33.33, dph: 7.67 },
      { predkontacia: "1Fp", clenenie: "PD", sadzba: 5, zaklad: 10, dph: 0.5 },
    ];
    const d = dorovnaj(r, rozpis, 1);
    expect(d[1]).toMatchObject({ zaklad: 66.67, dph: 15.33 });
    expect(chybaRozuctovania(d, rozpis)).toBeNull();
  });

  it("očistenie zaokrúhli a prázdne kódy dá na null", () => {
    expect(ocisti([{ predkontacia: " 1Fp ", clenenie: "", sadzba: 23, zaklad: 1.005, dph: 0.2311, text: " " }])[0]).toEqual({
      predkontacia: "1Fp",
      clenenie: null,
      sadzba: 23,
      zaklad: 1.01,
      dph: 0.23,
      text: null,
      kv: null,
    });
  });

  it("rozpis bločku zo starého dokladu bez rozpisu", () => {
    expect(rozpisBlocku({ net_amount: 10, vat_amount: 2.3, vat_rate: 23 })).toEqual([{ sadzba: 23, zaklad: 10, dph: 2.3 }]);
  });
});

describe("účtovanie pomerom", () => {
  const rozpisAuto = [{ sadzba: 23, zaklad: 100, dph: 23 }];

  it("50/50: zdaniteľná 50 %, len základ 30 %, nezdaniteľná 20 % a sedí na cent", async () => {
    const { nacitajPomer, rozuctovaniePodlaPomeru, podielOdpoctu, chybaRozuctovania } = await import("./rozuctovanie");
    const p = nacitajPomer({ typ: "dph5050", zaklad: 80, zdanitelna: "PHM", lenZaklad: "PHMZ", nezdanitelna: "SUK", clenenieBezOdpoctu: "PN" })!;
    const r = rozuctovaniePodlaPomeru(p, rozpisAuto, "PD");
    expect(r.map((x) => [x.predkontacia, x.zaklad, x.dph, x.clenenie])).toEqual([
      ["PHM", 50, 11.5, "PD"],
      ["PHMZ", 30, 6.9, "PN"],
      ["SUK", 20, 4.6, "PN"],
    ]);
    expect(chybaRozuctovania(r, rozpisAuto)).toBeNull();
    expect(podielOdpoctu(p)).toBe(0.5);
  });

  it("pomer 80/20 s odpočtom len z prvej časti; nesúci pomer sa odmietne", async () => {
    const { nacitajPomer, rozuctovaniePodlaPomeru, podielOdpoctu } = await import("./rozuctovanie");
    const p = nacitajPomer({ typ: "pomer", casti: [{ podiel: 80, predkontacia: "1Fp" }, { podiel: 20, predkontacia: "5Fp", odpocet: false }] })!;
    const r = rozuctovaniePodlaPomeru(p, [{ sadzba: 23, zaklad: 10.01, dph: 2.3 }], null);
    expect(r.reduce((a, x) => a + x.zaklad, 0)).toBeCloseTo(10.01, 2);
    expect(r.reduce((a, x) => a + x.dph, 0)).toBeCloseTo(2.3, 2);
    expect(podielOdpoctu(p)).toBe(0.8);
    expect(nacitajPomer({ typ: "pomer", casti: [{ podiel: 80, predkontacia: "1Fp" }, { podiel: 10, predkontacia: "5Fp" }] })).toBeNull();
  });
});
