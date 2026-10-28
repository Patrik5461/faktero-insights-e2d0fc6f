import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import {
  podielOdpoctuRiadkov,
  podielOdpoctuVozidla,
  rozdelPodlaVozidla,
  riadkyDokladu,
  rozpisBlocku,
  type OdpocetVozidla,
} from "./rozuctovanie";
import { kodyBezOdpoctu, odpocetDokladu, odpocetVozidiel } from "./vozidlo-odpocet";
import { buildPohodaExpensesXml } from "./export.server";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { blocekNaUctovanie, prijataNaUctovanie } from "./zauctovanie-export";
import { kontrolnyVykaz, priznanie, type Vstup } from "./dph-vykazy";

const auto: OdpocetVozidla = {
  podiel: 50,
  nazov: "Škoda Octavia (BA123AB)",
  clenenieBezOdpoctu: "PN",
};

const sucet = (r: { zaklad: number; dph: number }[], k: "zaklad" | "dph") =>
  Math.round(r.reduce((a, x) => a + x[k], 0) * 100) / 100;

describe("odpočet DPH podľa vozidla", () => {
  it("karta vozidla: krátí len 50 % a bez odpočtu, 100 % nemení nič", () => {
    expect(podielOdpoctuVozidla("50")).toBe(50);
    expect(podielOdpoctuVozidla("0")).toBe(0);
    expect(podielOdpoctuVozidla("100")).toBeNull();
    expect(podielOdpoctuVozidla(null)).toBeNull();
    expect(podielOdpoctuVozidla("")).toBeNull();
  });

  it.each([
    [23, 100, 23],
    [23, 40.65, 9.35],
    [19, 0.05, 0.01],
    [5, 3.33, 0.17],
    [23, 0.01, 0.01],
    [23, -81.3, -18.7], // dobropis
  ])("rozdelenie 50/50 sedí na cent (%s %%, základ %s, DPH %s)", (sadzba, zaklad, dph) => {
    const r = rozdelPodlaVozidla(
      [{ predkontacia: "PHM", clenenie: "PD", sadzba, zaklad, dph }],
      auto,
    );
    expect(r).toHaveLength(2);
    expect(sucet(r, "zaklad")).toBe(zaklad);
    expect(sucet(r, "dph")).toBe(dph);
    const [s, bez] = r;
    expect(s.odpocet).toBe(true);
    expect(bez.odpocet).toBe(false);
    expect(s.clenenie).toBe("PD");
    expect(bez.clenenie).toBe("PN");
    // Odpočítateľná časť je polovica, rozdiel najviac cent.
    expect(Math.abs(s.dph - bez.dph)).toBeLessThanOrEqual(0.01);
    // Predkontácia bez nastavenia ostáva z riadku.
    expect(bez.predkontacia).toBe("PHM");
  });

  it("bez odpočtu (0 %) — celý riadok bez nároku", () => {
    const r = rozdelPodlaVozidla(
      [{ predkontacia: "PHM", clenenie: "PD", sadzba: 23, zaklad: 10, dph: 2.3 }],
      {
        ...auto,
        podiel: 0,
      },
    );
    expect(r).toEqual([
      expect.objectContaining({ zaklad: 10, dph: 2.3, odpocet: false, clenenie: "PN" }),
    ]);
  });

  it("bloček s viacerými sadzbami: každá sadzba sa delí zvlášť a súčty sedia s rozpisom", () => {
    const d = {
      vat_breakdown: [
        { sadzba: 23, zaklad: 18.77, dph: 4.32 },
        { sadzba: 19, zaklad: 0.49, dph: 0.09 },
      ],
    };
    const rozpis = rozpisBlocku(d);
    const r = riadkyDokladu(d as any, rozpis, "PHM", "PD", {}, auto);
    expect(r).toHaveLength(4);
    for (const s of rozpis) {
      const tej = r.filter((x) => x.sadzba === s.sadzba);
      expect(sucet(tej, "zaklad")).toBe(s.zaklad);
      expect(sucet(tej, "dph")).toBe(s.dph);
    }
    expect(podielOdpoctuRiadkov(r)).toBeCloseTo(0.5, 1);
  });

  it("ručné rozúčtovanie na doklade má prednosť", () => {
    const rozpis = [{ sadzba: 23, zaklad: 100, dph: 23 }];
    const rozuctovanie = [
      { predkontacia: "PHM", clenenie: "PD", sadzba: 23, zaklad: 60, dph: 13.8 },
      { predkontacia: "OBC", clenenie: "PD", sadzba: 23, zaklad: 40, dph: 9.2 },
    ];
    const r = riadkyDokladu({ rozuctovanie }, rozpis, "PHM", "PD", {}, auto);
    expect(r.map((x) => x.zaklad)).toEqual([60, 40]);
    expect(podielOdpoctuRiadkov(r)).toBe(1);
  });

  it("pomer z pravidla aj predkontácia s pomerom majú prednosť — odpočet sa nekráti dvakrát", () => {
    const rozpis = [{ sadzba: 23, zaklad: 100, dph: 23 }];
    const pomer = {
      typ: "dph5050",
      zaklad: 80,
      zdanitelna: "P1",
      lenZaklad: "P2",
      nezdanitelna: "P3",
    };
    const zPravidla = riadkyDokladu({ rozuctovanie: pomer }, rozpis, "PHM", "PD", {}, auto);
    expect(new Set(zPravidla.map((x) => x.predkontacia))).toEqual(new Set(["P1", "P2", "P3"]));
    const zPredkontacie = riadkyDokladu({}, rozpis, "PHM", "PD", { PHM: pomer }, auto);
    expect(podielOdpoctuRiadkov(zPredkontacie)).toBe(0.5);
    expect(zPredkontacie).toHaveLength(3);
  });

  it("doklad bez nároku na odpočet a vozidlo so 100 % ostávajú bez zmeny", () => {
    const rozpis = [{ sadzba: 23, zaklad: 100, dph: 23 }];
    expect(riadkyDokladu({ odpocet: false }, rozpis, "PHM", "PD", {}, auto)).toHaveLength(1);
    expect(riadkyDokladu({}, rozpis, "PHM", "PD", {}, null)).toHaveLength(1);
    expect(riadkyDokladu({}, rozpis, "PHM", "PD", {}, { ...auto, podiel: 100 })).toHaveLength(1);
  });

  it("kódy pre neodpočítateľnú časť: z predkontácie DPH 50/50, inak predvolené", () => {
    expect(kodyBezOdpoctu({})).toEqual({ predkontacia: null, clenenie: "PN", zNastavenia: false });
    // Firma s číselníkom má na „bez nároku“ vlastný kód.
    expect(
      kodyBezOdpoctu({}, [
        {
          druh: "clenenie_dph",
          kod: "PD",
          popis: "Tuzemské plnenie s nárokom na odpočet",
          agenda: "1300 P01",
        },
        {
          druh: "clenenie_dph",
          kod: "PB",
          popis: "Tuzemské plnenie bez nároku na odpočet",
          agenda: "1300 P01",
        },
      ]).clenenie,
    ).toBe("PB");
    expect(
      kodyBezOdpoctu({
        AUTO: {
          typ: "dph5050",
          zaklad: 100,
          zdanitelna: "5AUTO",
          lenZaklad: "5AUTON",
          nezdanitelna: "5AUTO",
          clenenieBezOdpoctu: "PN",
        },
      }),
    ).toEqual({ predkontacia: "5AUTON", clenenie: "PN", zNastavenia: true });
  });

  it("mapa vozidiel obsahuje len krátený odpočet", () => {
    const m = odpocetVozidiel(
      [
        { id: "v1", name: "Octavia", license_plate: "BA123AB", odpocet_dph: "50" },
        { id: "v2", name: "Dodávka", odpocet_dph: "100" },
        { id: "v3", name: "Bez nastavenia", odpocet_dph: null },
      ],
      { predkontacia: null, clenenie: "PN", zNastavenia: false },
    );
    expect(Object.keys(m)).toEqual(["v1"]);
    expect(m.v1.nazov).toBe("Octavia (BA123AB)");
    expect(odpocetDokladu({ vehicle_id: "v1" }, m)?.podiel).toBe(50);
    expect(odpocetDokladu({ vehicle_id: "v2" }, m)).toBeNull();
    expect(odpocetDokladu({ vehicle_id: null }, m)).toBeNull();
  });
});

describe("export s vozidlom 50 %", () => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    removeNSPrefix: true,
  });
  const firmaSk = { ico: "56607016", default_currency: "EUR" };
  const blocek = {
    id: "b1",
    document_number: "2516",
    supplier_name: "Slovnaft, a.s.",
    supplier_ico: "31322832",
    supplier_ic_dph: "SK2020372640",
    issue_date: "2026-08-05",
    net_amount: 40.65,
    vat_amount: 9.35,
    total_amount: 50,
    vat_rate: 23,
    currency: "EUR",
    payment_method: "karta",
    vehicle_id: "v1",
    vat_breakdown: [{ sadzba: 23, zaklad: 40.65, dph: 9.35 }],
  };
  const nast = {
    predkontaciaDoklady: "5PHM",
    clenenieDphDoklady: "PD",
    odpocetVozidiel: { v1: { ...auto, predkontaciaBezOdpoctu: "5PHMN" } },
  };

  it("Pohoda: bloček sa rozúčtuje na polovicu s odpočtom a polovicu bez neho", () => {
    const xml = buildPohodaExpensesXml({ company: firmaSk, doklady: [blocek], nastavenia: nast });
    const inv = parser.parse(xml).dataPack.dataPackItem.invoice;
    expect(inv.invoiceHeader.accounting.ids).toBe("Rozúčtovať");
    const pol = ([] as any[]).concat(inv.invoiceDetail.invoiceItem);
    expect(pol.map((p) => [p.accounting.ids, p.classificationVAT.ids])).toEqual([
      ["5PHM", "PD"],
      ["5PHMN", "PN"],
    ]);
    const z = pol.map((p) => Number(p.homeCurrency.price));
    const d = pol.map((p) => Number(p.homeCurrency.priceVAT));
    expect(z).toEqual([20.33, 20.32]);
    expect(d).toEqual([4.68, 4.67]);
    // Súhrn dokladu ostáva celý — Pohoda neodpočítanú DPH zaúčtuje do nákladu sama podľa členenia.
    const s = inv.invoiceSummary.homeCurrency;
    expect(Number(s.priceHigh)).toBe(40.65);
    expect(Number(s.priceHighVAT)).toBe(9.35);
  });

  it("Pohoda: prijatá faktúra za servis s vozidlom", () => {
    const p = prijataAkoDoklad({
      id: "p1",
      company_id: "c",
      supplier_name: "Autoservis s. r. o.",
      supplier_ic_dph: "SK2020000001",
      invoice_number: "FA-77",
      issue_date: "2026-08-10",
      delivery_date: "2026-08-10",
      due_date: "2026-08-24",
      currency: "EUR",
      amount_without_vat: 200,
      vat_amount: 46,
      amount_total: 246,
      payment_method: "prevod",
      vehicle_id: "v1",
    });
    const xml = buildPohodaExpensesXml({
      company: firmaSk,
      doklady: [p],
      nastavenia: { ...nast, predkontaciaPrijata: "5SERV", clenenieDphPrijata: "PD" },
    });
    const inv = parser.parse(xml).dataPack.dataPackItem.invoice;
    const pol = ([] as any[]).concat(inv.invoiceDetail.invoiceItem);
    expect(pol.map((x) => Number(x.homeCurrency.priceVAT))).toEqual([23, 23]);
    expect(pol.map((x) => x.classificationVAT.ids)).toEqual(["PD", "PN"]);
  });

  it("Pohoda: ručné rozúčtovanie na doklade vozidlo prebije", () => {
    const xml = buildPohodaExpensesXml({
      company: firmaSk,
      doklady: [
        {
          ...blocek,
          rozuctovanie: [
            { predkontacia: "5PHM", clenenie: "PD", sadzba: 23, zaklad: 30, dph: 6.9 },
            { predkontacia: "5OBC", clenenie: "PD", sadzba: 23, zaklad: 10.65, dph: 2.45 },
          ],
        },
      ],
      nastavenia: nast,
    });
    const pol = ([] as any[]).concat(
      parser.parse(xml).dataPack.dataPackItem.invoice.invoiceDetail.invoiceItem,
    );
    expect(pol.map((x) => x.accounting.ids)).toEqual(["5PHM", "5OBC"]);
  });

  it("Omega/Money/Flexi: riadky účtovania s polovicou bez odpočtu", () => {
    const b = blocekNaUctovanie(blocek, nast as any);
    expect(b.riadky.map((r) => [r.predkontacia, r.clenenie, r.odpocet, r.dph])).toEqual([
      ["5PHM", "PD", true, 4.68],
      ["5PHMN", "PN", false, 4.67],
    ]);
    const p = prijataNaUctovanie(
      {
        id: "p1",
        invoice_number: "FA-77",
        supplier_name: "Autoservis",
        issue_date: "2026-08-10",
        amount_without_vat: 200,
        vat_amount: 46,
        amount_total: 246,
        vehicle_id: "v1",
        type: "regular",
      },
      { ...nast, predkontaciaPrijata: "5SERV" } as any,
    );
    expect(p.riadky.filter((r) => r.odpocet).reduce((a, r) => a + r.dph, 0)).toBe(23);
  });
});

describe("výkaz DPH s vozidlom 50 %", () => {
  it("do priznania aj KV ide len odpočítateľná polovica", () => {
    // Rovnaký výpočet podielu ako dph-vykazy.server.ts.
    const d = { vat_breakdown: [{ sadzba: 23, zaklad: 40.65, dph: 9.35 }], vehicle_id: "v1" };
    const r = riadkyDokladu(
      d as any,
      rozpisBlocku(d),
      "5PHM",
      null,
      {},
      odpocetDokladu(d, { v1: auto }),
    );
    const podiel = podielOdpoctuRiadkov(r);
    const v: Vstup = {
      obdobie: { rok: 2026, mesiac: 8 },
      vystavene: [],
      prijate: [
        {
          cislo: "FA-77",
          dodavatelNazov: "Autoservis",
          dodavatelIcDph: "SK2020000001",
          datumDodania: "2026-08-10",
          rezim: "tuzemsko",
          odpocet: true,
          riadky: [{ sadzba: 23, zaklad: 200, dan: 46 }],
          kv: "B2",
          podielOdpoctu: 0.5,
        },
      ],
      doklady: [
        {
          odpocet: true,
          podielOdpoctu: podiel,
          riadky: [{ sadzba: 23, zaklad: 40.65, dan: 9.35 }],
        },
      ],
    } as any;
    const kv = kontrolnyVykaz(v);
    expect(kv.b31).toEqual({ z: 40.65, d: 9.35, o: 4.68 });
    expect(kv.b2[0]).toMatchObject({ z: 200, d: 46, o: 23 });
    const p = priznanie(v);
    // Odpočet z tuzemska (r. 21) = 23 + 4,68 — nie celá daň 55,35.
    expect(p.r21).toBe(27.68);
  });
});
