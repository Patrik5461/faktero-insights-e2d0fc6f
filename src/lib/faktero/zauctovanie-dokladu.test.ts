import { describe, expect, it } from "vitest";
import { zmenaZauctovaniaDokladu } from "./zauctovanie-dokladu";

describe("zmenaZauctovaniaDokladu", () => {
  it("prázdne pole nič nemení (hromadné zaúčtovanie)", () => {
    expect(zmenaZauctovaniaDokladu({ predkontacia: "", clenenie: "  ", kv: null })).toEqual({});
  });
  it("vyplnené polia idú do stĺpcov, kv auto = null", () => {
    expect(
      zmenaZauctovaniaDokladu({
        predkontacia: " 501 ",
        clenenie: "PD",
        kv: "auto",
        kategoria: "PHM",
      }),
    ).toEqual({
      pohoda_predkontacia: "501",
      pohoda_clenenie_dph: "PD",
      kv_clenenie: null,
      category: "PHM",
    });
  });
  it("vymazať vyprázdni stĺpec", () => {
    expect(zmenaZauctovaniaDokladu({ vymazat: ["predkontacia", "pokladna"] })).toEqual({
      pohoda_predkontacia: null,
      pohoda_pokladna: null,
    });
  });
  it("vyplnená hodnota má prednosť pred vymazaním", () => {
    expect(zmenaZauctovaniaDokladu({ clenenie: "PN", vymazat: ["clenenie"] })).toEqual({
      pohoda_clenenie_dph: "PN",
    });
  });
});
