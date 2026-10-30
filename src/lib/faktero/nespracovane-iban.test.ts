import { describe, expect, it } from "vitest";
import {
  normalizujIban,
  smerPodlaIban,
  uctyFirmy,
  vlastnyUcetDokladu,
  vystavenaPodlaIban,
} from "./nespracovane-iban";

const ucty = [
  { iban: "SK31 1200 0000 1987 4263 7541", nazov: "Hlavný" },
  { iban: "CZ6508000000192000145399", nazov: "CZK" },
];

describe("vlastnyUcetDokladu", () => {
  it("porovná IBAN bez ohľadu na medzery a veľkosť písmen", () => {
    expect(normalizujIban(" sk31 1200-0000 ")).toBe("SK3112000000");
    expect(vlastnyUcetDokladu("sk3112000000198742637541", ucty)?.nazov).toBe("Hlavný");
    expect(vlastnyUcetDokladu("CZ65 0800 0000 1920 0014 5399", ucty)?.nazov).toBe("CZK");
  });

  it("cudzí, prázdny alebo neúplný IBAN nie je firemný", () => {
    expect(vlastnyUcetDokladu("SK8975000000000012345671", ucty)).toBeNull();
    expect(vlastnyUcetDokladu("", ucty)).toBeNull();
    expect(vlastnyUcetDokladu(null, ucty)).toBeNull();
    expect(vlastnyUcetDokladu("SK31", [{ iban: "SK31" }])).toBeNull();
  });
});

describe("vystavenaPodlaIban", () => {
  const iban = "SK3112000000198742637541";
  it("len keď je nastavenie zapnuté", () => {
    expect(
      vystavenaPodlaIban({ zapnute: false, druh: "faktura", ibanDokladu: iban, ucty }),
    ).toBeNull();
    expect(
      vystavenaPodlaIban({ zapnute: true, druh: "faktura", ibanDokladu: iban, ucty })?.nazov,
    ).toBe("Hlavný");
  });

  it("faktúra, záloha, dobropis aj neurčený druh áno — bloček a iný doklad nie", () => {
    for (const druh of ["faktura", "zalohova", "dobropis", "", null])
      expect(vystavenaPodlaIban({ zapnute: true, druh, ibanDokladu: iban, ucty })).not.toBeNull();
    for (const druh of ["blocek", "ostatny"])
      expect(vystavenaPodlaIban({ zapnute: true, druh, ibanDokladu: iban, ucty })).toBeNull();
  });
});

describe("uctyFirmy", () => {
  it("spojí ručné účty, napojené banky a IBAN firmy bez duplicít", () => {
    const u = uctyFirmy(
      [{ iban: "SK31 1200 0000 1987 4263 7541", nazov: null }],
      [
        { iban: "SK3112000000198742637541", nazov: "Tatra banka" },
        { iban: "", nazov: "bez IBAN-u" },
      ],
      [{ iban: "CZ6508000000192000145399" }],
    );
    expect(u).toEqual([
      { iban: "SK31 1200 0000 1987 4263 7541", nazov: "Tatra banka" },
      { iban: "CZ6508000000192000145399", nazov: null },
    ]);
    expect(uctyFirmy(null, undefined)).toEqual([]);
  });
});

describe("smerPodlaIban", () => {
  const zaklad = { zapnute: true, druh: "faktura", ucty };

  it("vlastný IBAN príjemcu platby = vystavená faktúra s účtom", () => {
    const s = smerPodlaIban({ ...zaklad, ibanDokladu: "SK31 1200 0000 1987 4263 7541" });
    expect(s).toMatchObject({ smer: "vystavena", ucet: { nazov: "Hlavný" } });
  });

  it("cudzí IBAN = prijatá, dôvod cudzí", () => {
    expect(smerPodlaIban({ ...zaklad, ibanDokladu: "SK89 7500 0000 0000 1234 5671" })).toEqual({
      smer: "prijata",
      dovod: "cudzi",
      iban: "SK89 7500 0000 0000 1234 5671",
    });
  });

  it("firemný IBAN ako účet odberateľa = prijatá, dôvod odberateľ", () => {
    const s = smerPodlaIban({
      ...zaklad,
      ibanDokladu: "",
      ibanOdberatela: "CZ6508000000192000145399",
    });
    expect(s).toMatchObject({ smer: "prijata", dovod: "odberatel", ucet: { nazov: "CZK" } });
  });

  it("IBAN príjemcu má prednosť pred IBAN-om odberateľa", () => {
    const s = smerPodlaIban({
      ...zaklad,
      ibanDokladu: "SK3112000000198742637541",
      ibanOdberatela: "CZ6508000000192000145399",
    });
    expect(s?.smer).toBe("vystavena");
  });

  it("nedá sa povedať: vypnuté, bez účtov, bez IBAN-u, nezmysel, bloček", () => {
    const iban = "SK8975000000000012345671";
    expect(smerPodlaIban({ ...zaklad, zapnute: false, ibanDokladu: iban })).toBeNull();
    expect(smerPodlaIban({ ...zaklad, ucty: [], ibanDokladu: iban })).toBeNull();
    expect(smerPodlaIban({ ...zaklad, ibanDokladu: "" })).toBeNull();
    expect(smerPodlaIban({ ...zaklad, ibanDokladu: "1234567890123456" })).toBeNull();
    expect(smerPodlaIban({ ...zaklad, druh: "blocek", ibanDokladu: iban })).toBeNull();
  });
});
