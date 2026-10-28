import { describe, expect, it } from "vitest";
import {
  kodyZaokruhlenia,
  ponuka,
  textMoznosti,
  zoradPodlaDokladu,
  type MoznostKodu,
} from "./predkontacie";

const m = (kod: string, z: Partial<MoznostKodu> = {}): MoznostKodu => ({
  kod,
  popis: null,
  agenda: "",
  ucty: null,
  ...z,
});

describe("účtovné položky — typ dokladu a platby", () => {
  it("ponuka prenesie typ z číselníka", () => {
    const r = ponuka(
      [
        {
          druh: "predkontacia",
          kod: "PHMk",
          popis: "Nákup PHM – karta",
          agenda: "",
          ucet_md: "501200",
          ucet_d: "325100",
          typ_dokladu: "blocek",
          typ_platby: "karta",
        },
      ],
      "predkontacia",
    );
    expect(r[0]).toMatchObject({
      kod: "PHMk",
      typDokladu: "blocek",
      typPlatby: "karta",
      ucty: "501200/325100",
    });
  });

  it("najprv presné, potom všeobecné, nakoniec pre iný doklad", () => {
    const zoznam = [
      m("A"),
      m("FAK", { typDokladu: "faktura" }),
      m("KAR", { typDokladu: "blocek", typPlatby: "karta" }),
      m("HOT", { typDokladu: "blocek", typPlatby: "hotovost" }),
      m("BL", { typDokladu: "blocek" }),
    ];
    expect(zoradPodlaDokladu(zoznam, { typ: "blocek", platba: "karta" }).map((x) => x.kod)).toEqual(
      ["KAR", "BL", "A", "FAK", "HOT"],
    );
    // Bez platby rozhoduje len typ dokladu.
    expect(zoradPodlaDokladu(zoznam, { typ: "faktura" }).map((x) => x.kod)[0]).toBe("FAK");
  });

  it("názov ako hlavný text voľby", () => {
    expect(
      textMoznosti({ kod: "PHMk", popis: "Nákup PHM – platba kartou", ucty: "501200/325100" }),
    ).toBe("Nákup PHM – platba kartou · PHMk · 501200/325100");
    expect(textMoznosti({ kod: "1Fp", popis: null, ucty: "501/321" })).toBe("1Fp (501/321)");
  });
});

describe("zaokrúhlenie podľa znamienka", () => {
  const firma = {
    pohoda_predkontacia_zaokruhlenie: "ZAOK",
    pohoda_predkontacia_zaokruhlenie_plus: "548100",
    pohoda_predkontacia_zaokruhlenie_minus: "648100",
    pohoda_clenenie_dph_zaokruhlenie_plus: "PN",
    kv_clenenie_zaokruhlenie_minus: "X",
  };
  it("kladné a záporné zvlášť", () => {
    expect(kodyZaokruhlenia(firma, 0.02)).toEqual({
      predkontacia: "548100",
      clenenie: "PN",
      kv: null,
    });
    expect(kodyZaokruhlenia(firma, -0.01)).toEqual({
      predkontacia: "648100",
      clenenie: null,
      kv: "X",
    });
  });
  it("bez konkrétnej platí spoločná", () => {
    expect(kodyZaokruhlenia({ pohoda_predkontacia_zaokruhlenie: "ZAOK" }, -0.03).predkontacia).toBe(
      "ZAOK",
    );
    expect(kodyZaokruhlenia(null, 1).predkontacia).toBeNull();
  });
});
