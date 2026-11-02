import { describe, it, expect } from "vitest";
import {
  SK_VAT_RATES,
  krajinaDane,
  sadzbyKrajiny,
  sadzbyKuDnu,
  zakladnaSadzba,
  najblizsiaSadzba,
  vatBucketKey,
  vatBucketLabel,
  vatBucketOrder,
  vatRateOptions,
  historickeSadzby,
  popisSadzby,
  porovnajSadzby,
  zoradSadzby,
  zoradPodlaSadzby,
} from "./vat-rates";

describe("sadzby platné v SR", () => {
  it("od 1. 1. 2025 sú 23, 19, 5 a 0", () => {
    expect([...SK_VAT_RATES]).toEqual([23, 19, 5, 0]);
  });

  it("13 % neexistuje a nesmie sa dať vybrať", () => {
    expect(vatRateOptions()).not.toContain(13);
  });

  it("historickú sadzbu na doklade ponechá, ale neponúka ju nanovo", () => {
    expect(vatRateOptions("SK", 20)).toEqual([0, 5, 19, 20, 23]);
    expect(vatRateOptions("SK")).not.toContain(20);
  });
});

/*
  Režim sa nikde nezapína ručne — vyplýva z krajiny registrácie firmy. Toto je
  jadro tej zmeny: česká firma nesmie dostať slovenské sadzby ani naopak.
*/
describe("režim podľa krajiny firmy", () => {
  it("české sadzby sú od 2024 21, 12 a 0", () => {
    expect(sadzbyKrajiny("CZ")).toEqual([21, 12, 0]);
    expect(zakladnaSadzba("CZ")).toBe(21);
  });

  it("slovenskú 19 % česká firma neponúka a naopak", () => {
    expect(sadzbyKrajiny("CZ")).not.toContain(19);
    expect(sadzbyKrajiny("SK")).not.toContain(21);
  });

  it("krajinu rozozná aj z voľného textu, neznáme necháva na Slovensku", () => {
    for (const v of ["CZ", "cz", "Česko", "Cesko", "CZE", "Czech Republic"])
      expect(krajinaDane(v)).toBe("CZ");
    for (const v of ["SK", "Slovensko", "", null, undefined, "AT"])
      expect(krajinaDane(v)).toBe("SK");
  });

  /*
    Opravný doklad k plneniu spred zmeny nesie sadzbu, ktorá vtedy platila.
    Bez tabuľky podľa dňa by sa český dobropis z roku 2023 prepočítal na 12 %.
  */
  it("k staršiemu dňu dá sadzby, ktoré vtedy platili", () => {
    expect(sadzbyKuDnu("CZ", "2023-06-30")).toEqual({ high: 21, low: 15, third: 10 });
    expect(sadzbyKuDnu("CZ", "2024-01-01")).toEqual({ high: 21, low: 12, third: null });
    expect(sadzbyKuDnu("SK", "2024-12-31")).toEqual({ high: 20, low: 10, third: null });
    expect(sadzbyKuDnu("SK", "2025-01-01")).toEqual({ high: 23, low: 19, third: 5 });
  });

  it("prehľad DPH má české riadky pomenované po česky správne", () => {
    expect(vatBucketOrder(["exempt"], "CZ")).toEqual(["0", "12", "21", "exempt", "pdp"]);
    expect(vatBucketLabel("21", "CZ")).toBe("21 % (základná)");
    expect(vatBucketLabel("12", "CZ")).toBe("12 % (znížená)");
    // Slovenská sadzba je pre českú firmu historická, nie znížená.
    expect(vatBucketLabel("19", "CZ")).toBe("19 % (historická)");
  });

  it("dopočítanú sadzbu prilepí k sadzbe vlastnej krajiny", () => {
    expect(najblizsiaSadzba(20.9, "CZ")).toBe(21);
    expect(najblizsiaSadzba(11.8, "CZ")).toBe(12);
    // 12 % na Slovensku nikdy neplatilo — nesmie sa prilepiť k ničomu.
    expect(najblizsiaSadzba(11.8, "SK")).toBe(11.8);
  });
});

describe("vatBucketKey", () => {
  it("platné sadzby dostanú vlastný riadok", () => {
    expect(vatBucketKey(23)).toBe("23");
    expect(vatBucketKey(19)).toBe("19");
    expect(vatBucketKey(5)).toBe("5");
    expect(vatBucketKey(0)).toBe("0");
  });

  // Toto je jadro chyby, ktorú oprava odstraňuje: 19 % a 20 % padali medzi
  // oslobodené plnenia, takže priznanie ticho nesedelo.
  it("zdanené plnenie nikdy neskončí medzi oslobodenými", () => {
    for (const r of [19, 20, 10, 21, 27]) {
      expect(vatBucketKey(r)).not.toBe("exempt");
      expect(vatBucketKey(r)).toBe(String(r));
    }
  });

  it("chýbajúca alebo nezmyselná sadzba je oslobodené plnenie", () => {
    expect(vatBucketKey(null)).toBe("exempt");
    expect(vatBucketKey(undefined)).toBe("exempt");
    expect(vatBucketKey(Number.NaN)).toBe("exempt");
    expect(vatBucketKey(-5)).toBe("exempt");
  });
});

describe("najblizsiaSadzba", () => {
  it("zaokrúhlenie na centy prilepí k platnej sadzbe", () => {
    expect(najblizsiaSadzba(22.97)).toBe(23);
    expect(najblizsiaSadzba(23.04)).toBe(23);
    expect(najblizsiaSadzba(18.8)).toBe(19);
    expect(najblizsiaSadzba(20.2)).toBe(20);
  });

  it("nezamení 19 za 23", () => {
    expect(najblizsiaSadzba(19)).toBe(19);
    expect(najblizsiaSadzba(21)).not.toBe(23);
    expect(najblizsiaSadzba(21)).not.toBe(19);
  });

  it("neznámu sadzbu nechá tak, len ju zaokrúhli", () => {
    expect(najblizsiaSadzba(27.123)).toBe(27.12);
    expect(najblizsiaSadzba(Number.NaN)).toBe(0);
  });
});

describe("vatBucketOrder", () => {
  it("platné sadzby idú vzostupne, oslobodené a PDP posledné", () => {
    expect(vatBucketOrder(["exempt"])).toEqual(["0", "5", "19", "23", "exempt", "pdp"]);
  });

  it("sadzbu, ktorá je v dátach navyše, zaradí podľa veľkosti medzi ostatné", () => {
    expect(vatBucketOrder(["20", "23", "pdp"])).toEqual([
      "0",
      "5",
      "19",
      "20",
      "23",
      "exempt",
      "pdp",
    ]);
  });

  it("nezopakuje riadok, ktorý už v základnom poradí je", () => {
    const poradie = vatBucketOrder(["23", "23", "5"]);
    expect(poradie).toEqual([...new Set(poradie)]);
  });
});

describe("vatBucketLabel", () => {
  it("pomenuje riadky zrozumiteľne", () => {
    expect(vatBucketLabel("23")).toBe("23 % (základná)");
    expect(vatBucketLabel("19")).toBe("19 % (znížená)");
    expect(vatBucketLabel("0")).toBe("0 % (nulová)");
    expect(vatBucketLabel("exempt")).toBe("Oslobodené");
    expect(vatBucketLabel("pdp")).toBe("PDP (prenos daňovej povinnosti)");
  });

  it("historickú sadzbu označí ako historickú, nech je jasné, prečo tam je", () => {
    expect(vatBucketLabel("20")).toBe("20 % (historická)");
  });
});

describe("historické sadzby", () => {
  it("SK ponúkne to, čo platilo pred rokom 2025", () => {
    expect(historickeSadzby("SK", "2026-09-29")).toEqual([
      { sadzba: 10, doRoku: 2024 },
      { sadzba: 20, doRoku: 2024 },
    ]);
  });
  it("CZ ponúkne zrušené znížené sadzby", () => {
    expect(historickeSadzby("CZ", "2026-09-29")).toEqual([
      { sadzba: 10, doRoku: 2023 },
      { sadzba: 15, doRoku: 2023 },
    ]);
  });
  it("sadzba, ktorá platí aj dnes, medzi historické nepatrí", () => {
    const h = historickeSadzby("CZ", "2026-09-29").map((x) => x.sadzba);
    expect(h).not.toContain(21);
  });
  it("vráti najviac tri", () => {
    expect(historickeSadzby("SK", "2026-09-29", 1)).toHaveLength(1);
    expect(historickeSadzby("SK", "2026-09-29").length).toBeLessThanOrEqual(3);
  });
  it("k dňu spred zmeny sa história neponúka", () => {
    expect(historickeSadzby("SK", "2024-06-01")).toEqual([]);
  });
  it("popis odlíši historickú sadzbu rokom", () => {
    expect(popisSadzby(23, "SK", "2026-09-29")).toBe("23 %");
    expect(popisSadzby(20, "SK", "2026-09-29")).toBe("20 % (do 2024)");
  });
});

/*
  Poradie sadzieb všade v aplikácii: numericky vzostupne. Nie je to pevný
  zoznam — SK, CZ aj historické či zahraničné sadzby sa zoradia rovnako.
*/
describe("poradie sadzieb (zoradSadzby, zoradPodlaSadzby)", () => {
  /* Len príklad pre slovenskú firmu, nie pevný zoznam. */
  const VAT_RATES_ORDER = [0, 5, 19, 23];

  it("SK 5, 23, 19, 0 → 0, 5, 19, 23", () => {
    expect(zoradSadzby([5, 23, 19, 0])).toEqual(VAT_RATES_ORDER);
    expect(zoradSadzby(sadzbyKrajiny("SK", "2026-11-02"))).toEqual(VAT_RATES_ORDER);
  });

  it("CZ 21 / 12 / 0 vzostupne", () => {
    expect(zoradSadzby(sadzbyKrajiny("CZ", "2026-11-02"))).toEqual([0, 12, 21]);
    expect(zoradSadzby([21, 0, 12])).toEqual([0, 12, 21]);
  });

  it("historické 10 % a 20 % zaradí numericky medzi ostatné", () => {
    expect(zoradSadzby([23, 20, 5, 10, 19, 0])).toEqual([0, 5, 10, 19, 20, 23]);
  });

  it("zvládne reťazce, desatinné sadzby a nečíselné dá na koniec", () => {
    expect(zoradSadzby(["23", "5", "19"])).toEqual(["5", "19", "23"]);
    expect([7.7, 2.5, 8.1].sort(porovnajSadzby)).toEqual([2.5, 7.7, 8.1]);
    expect([null, 23, undefined, 0].sort(porovnajSadzby)).toEqual([0, 23, null, undefined]);
  });

  it("riadky zoradí podľa sadzby, hodnoty a väzbu základ ↔ daň nechá", () => {
    const rozpis = [
      { sadzba: 5, zaklad: 10, dph: 0.5 },
      { sadzba: 23, zaklad: 100, dph: 23 },
      { sadzba: 19, zaklad: 50, dph: 9.5 },
    ];
    const z = zoradPodlaSadzby(rozpis, "sadzba");
    expect(z).toEqual([
      { sadzba: 5, zaklad: 10, dph: 0.5 },
      { sadzba: 19, zaklad: 50, dph: 9.5 },
      { sadzba: 23, zaklad: 100, dph: 23 },
    ]);
    // Vstup ostane nedotknutý (uložené dáta sa nemenia).
    expect(rozpis.map((r) => r.sadzba)).toEqual([5, 23, 19]);
  });

  it("je stabilné — bežný a PDP riadok s rovnakou sadzbou ostanú v poradí", () => {
    const z = zoradPodlaSadzby(
      [
        { sadzba: 23, pdp: false },
        { sadzba: 0, pdp: false },
        { sadzba: 23, pdp: true },
      ],
      (r) => r.sadzba,
    );
    expect(z).toEqual([
      { sadzba: 0, pdp: false },
      { sadzba: 23, pdp: false },
      { sadzba: 23, pdp: true },
    ]);
  });

  it("sadzbyKrajiny ostáva od základnej — volajúci berú [0] ako základnú", () => {
    expect(sadzbyKrajiny("SK", "2026-11-02")[0]).toBe(23);
    expect(sadzbyKrajiny("CZ", "2026-11-02")[0]).toBe(21);
  });
});
