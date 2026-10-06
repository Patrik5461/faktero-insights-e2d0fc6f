import { describe, expect, it } from "vitest";
import { pridajFilter, zlucNastavenia, type StlpecZoznamu } from "./nastavenia-zoznamov";

const stlpce: StlpecZoznamu[] = [
  { kluc: "dodavatel", nazov: "Dodávateľ", povinny: true },
  { kluc: "suma", nazov: "Suma" },
  { kluc: "ico", nazov: "IČO", predvoleny: false },
];

describe("nastavenia zoznamov", () => {
  it("bez nastavenia predvolené stĺpce", () => {
    expect(zlucNastavenia(stlpce, []).viditelne).toEqual(["dodavatel", "suma"]);
  });
  it("firma prebíja všetky firmy, povinný stĺpec sa nedá skryť", () => {
    const r = zlucNastavenia(stlpce, [
      { company_id: null, stlpce: ["suma", "ico"], filtre: [] },
      { company_id: "f", stlpce: ["ico"], filtre: [] },
    ]);
    expect(r.viditelne).toEqual(["dodavatel", "ico"]);
    expect(r.stlpcePreVsetky).toBe(false);
    expect(
      zlucNastavenia(stlpce, [{ company_id: null, stlpce: ["suma"], filtre: [] }]).stlpcePreVsetky,
    ).toBe(true);
  });
  it("filtre z firmy aj spoločné, rovnaké meno sa prepíše", () => {
    const r = zlucNastavenia(stlpce, [
      {
        company_id: null,
        stlpce: null,
        filtre: [{ nazov: "Orange", hodnoty: { dodavatel: "Orange" } }],
      },
      {
        company_id: "f",
        stlpce: null,
        filtre: [{ nazov: "Neuhradené", hodnoty: { stav: "received" } }, { nazov: "" }],
      },
    ]);
    expect(r.filtre.map((f) => [f.nazov, f.vsetkyFirmy])).toEqual([
      ["Neuhradené", false],
      ["Orange", true],
    ]);
    expect(
      pridajFilter(r.filtre, { nazov: "Orange", hodnoty: { a: "1" } }).filter(
        (f) => f.nazov === "Orange",
      ),
    ).toHaveLength(1);
  });
});
