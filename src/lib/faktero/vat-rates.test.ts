import { describe, it, expect } from "vitest";
import {
  SK_VAT_RATES,
  LEGACY_SK_VAT_RATES,
  najblizsiaSadzba,
  vatBucketKey,
  vatBucketLabel,
  vatBucketOrder,
  vatRateOptions,
} from "./vat-rates";

describe("sadzby platné v SR", () => {
  it("od 1. 1. 2025 sú 23, 19, 5 a 0", () => {
    expect([...SK_VAT_RATES]).toEqual([23, 19, 5, 0]);
  });

  it("13 % neexistuje a nesmie sa dať vybrať", () => {
    expect(vatRateOptions()).not.toContain(13);
  });

  it("historickú sadzbu na doklade ponechá, ale neponúka ju nanovo", () => {
    expect(vatRateOptions(20)).toEqual([23, 20, 19, 5, 0]);
    expect(vatRateOptions()).not.toContain(20);
    expect([...LEGACY_SK_VAT_RATES]).toEqual([20, 10]);
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
  it("platné sadzby idú prvé, oslobodené a PDP posledné", () => {
    expect(vatBucketOrder(["exempt"])).toEqual(["23", "19", "5", "0", "exempt", "pdp"]);
  });

  it("sadzbu, ktorá je v dátach navyše, zaradí podľa veľkosti pred oslobodené", () => {
    expect(vatBucketOrder(["20", "23", "pdp"])).toEqual([
      "23",
      "19",
      "5",
      "0",
      "20",
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
