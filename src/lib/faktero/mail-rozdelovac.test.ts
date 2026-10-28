import { describe, expect, it } from "vitest";
import {
  dovodNepriradenia,
  firmaPodlaOdberatela,
  localPartRozdelovaca,
  normalizujNazov,
  poznamkaRozdelovaca,
  smieZapisovatDoklady,
  vyberFirmuPodlaOdberatela,
  type FirmaNaRozdelenie,
} from "./mail-rozdelovac";

const firmy: FirmaNaRozdelenie[] = [
  {
    id: "a",
    name: "Alfa s.r.o.",
    ico: "12 345 678",
    ic_dph: "SK2020123456",
    dic: "2020123456",
    ibany: ["SK31 1200 0000 1987 4263 7541"],
  },
  { id: "b", name: "Beta, a.s.", ico: "87654321", ic_dph: null, dic: "2021111111", ibany: [] },
  { id: "c", name: "Gama", ico: null, ic_dph: "SK2020999999", ibany: ["CZ6508000000192000145399"] },
];

const vyber = (ai: Record<string, unknown>, f = firmy) => vyberFirmuPodlaOdberatela(ai, f);

describe("rozdeľovač — výber firmy podľa odberateľa", () => {
  it("priradí podľa IČO bez ohľadu na medzery", () => {
    expect(vyber({ buyer_ico: "12345678" })).toMatchObject({ vysledok: "zhoda", podla: "ico" });
    expect(firmaPodlaOdberatela({ buyer_ico: "876 543 21" }, firmy)?.id).toBe("b");
  });

  it("bez IČO podľa IČ DPH, malé písmená nevadia", () => {
    expect(vyber({ buyer_ic_dph: "sk2020999999" })).toMatchObject({
      firma: { id: "c" },
      podla: "ic_dph",
    });
  });

  it("podľa DIČ, aj keď ho AI dala s predponou štátu", () => {
    expect(vyber({ buyer_dic: "2021111111" }).firma?.id).toBe("b");
    expect(vyber({ buyer_dic: "SK 2021111111" }).firma?.id).toBe("b");
  });

  it("IČO a IČ DPH tej istej firmy je jedna zhoda", () => {
    expect(vyber({ buyer_ico: "12345678", buyer_ic_dph: "SK2020123456" })).toMatchObject({
      firma: { id: "a" },
      vysledok: "zhoda",
    });
  });

  it("IČO jednej a IČ DPH druhej firmy je nejednoznačné", () => {
    const v = vyber({ buyer_ico: "12345678", buyer_ic_dph: "SK2020999999" });
    expect(v.firma).toBeNull();
    expect(v.vysledok).toBe("nejednoznacne");
    expect(v.kandidati.sort()).toEqual(["a", "c"]);
  });

  it("dve firmy s rovnakým IČO sa nehádžu", () => {
    const v = vyber({ buyer_ico: "87654321" }, [
      ...firmy,
      { id: "d", name: "Beta 2", ico: "87654321", ic_dph: null },
    ]);
    expect(v).toMatchObject({ firma: null, vysledok: "nejednoznacne" });
    expect(dovodNepriradenia(v)).toMatch(/viac vašich firiem/);
  });

  it("cudzie IČO nepustí zhodu podľa názvu ani IBAN", () => {
    const v = vyber({
      buyer_ico: "11111111",
      buyer_name: "Alfa s.r.o.",
      buyer_iban: "SK3112000000198742637541",
    });
    expect(v).toMatchObject({ firma: null, vysledok: "cudzi" });
    expect(dovodNepriradenia(v)).toMatch(/nesedí na žiadnu/);
  });

  it("bez silných údajov podľa IBAN platiteľa", () => {
    expect(vyber({ buyer_iban: "sk31 1200 0000 1987 4263 7541" })).toMatchObject({
      firma: { id: "a" },
      podla: "iban",
    });
  });

  it("bez silných údajov podľa názvu bez právnej formy a diakritiky", () => {
    expect(vyber({ buyer_name: "BETA AS" }).firma?.id).toBe("b");
    expect(vyber({ buyer_name: "Alfa, spol. s r.o." }).firma?.id).toBe("a");
    expect(normalizujNazov("Ťažba Žilina, s. r. o.")).toBe("tazba zilina");
  });

  it("rovnaký názov dvoch firiem je nejednoznačný", () => {
    const v = vyber({ buyer_name: "Gama" }, [
      ...firmy,
      { id: "e", name: "GAMA s.r.o.", ico: "1", ic_dph: null },
    ]);
    expect(v).toMatchObject({ firma: null, vysledok: "nejednoznacne" });
  });

  it("bez údajov odberateľa čaká na ručné priradenie", () => {
    expect(vyber({})).toMatchObject({ firma: null, vysledok: "bez_udajov" });
    expect(vyber({ buyer_name: "x" }).vysledok).toBe("bez_udajov");
    expect(vyberFirmuPodlaOdberatela(null, firmy).vysledok).toBe("bez_udajov");
  });

  it("firma, ktorá doklad vystavila, nie je jeho odberateľom", () => {
    // Alfa fakturuje Gama; AI omylom dala aj názov odberateľa Alfa.
    const v = vyber({ supplier_ico: "12345678", buyer_name: "Alfa" });
    expect(v.firma).toBeNull();
    // Keď je odberateľ uvedený IČO, rozhodne IČO.
    expect(vyber({ supplier_ico: "12345678", buyer_ic_dph: "SK2020999999" }).firma?.id).toBe("c");
  });

  it("vyberá len z firiem, ktoré dostal (bez práva firma v zozname nie je)", () => {
    expect(vyber({ buyer_ico: "12345678" }, firmy.slice(1))).toMatchObject({
      firma: null,
      vysledok: "cudzi",
    });
    expect(vyber({ buyer_ico: "12345678" }, [])).toMatchObject({ firma: null });
  });
});

describe("rozdeľovač — oprávnenia a texty", () => {
  it("vlastný prístup musí mať doklady na úpravu", () => {
    expect(smieZapisovatDoklady("owner", null)).toBe(true);
    expect(smieZapisovatDoklady("accountant", {})).toBe(true);
    expect(smieZapisovatDoklady("custom", { doklady: "edit" })).toBe(true);
    expect(smieZapisovatDoklady("custom", { doklady: "read" })).toBe(false);
    expect(smieZapisovatDoklady("custom", { faktury: "edit" })).toBe(false);
    expect(smieZapisovatDoklady(null, null)).toBe(false);
  });

  it("poznámka hovorí, podľa čoho sa zaradilo", () => {
    expect(poznamkaRozdelovaca("ico")).toBe("Zaradil rozdeľovač podľa IČO odberateľa.");
    expect(poznamkaRozdelovaca(null)).toMatch(/ručne/);
  });

  it("adresa má náhodný chvost", () => {
    expect(localPartRozdelovaca(() => 0)).toBe("rozdelovac-aaaaaaaaaa");
    expect(localPartRozdelovaca()).toMatch(/^rozdelovac-[a-z2-9]{10}$/);
  });
});
