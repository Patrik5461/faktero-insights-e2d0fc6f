import { describe, it, expect } from "vitest";
import { dalsieCisloDokladu, poradieZCisla } from "./cislovanie";

describe("poradieZCisla", () => {
  it("číta poradie až za predponou", () => {
    expect(poradieZCisla("OBJ20260001", "OBJ2026")).toBe(1);
    expect(poradieZCisla("Q20260042", "Q2026")).toBe(42);
  });

  it("cudziu predponu odmietne", () => {
    expect(poradieZCisla("Q20260001", "OBJ2026")).toBeNull();
  });

  it("nečíselný chvost odmietne", () => {
    expect(poradieZCisla("OBJ2026A001", "OBJ2026")).toBeNull();
    expect(poradieZCisla("OBJ2026", "OBJ2026")).toBeNull();
  });
});

describe("dalsieCisloDokladu", () => {
  it("prvé číslo v roku", () => {
    expect(dalsieCisloDokladu("OBJ2026", [])).toBe("OBJ20260001");
  });

  // Toto je chyba, kvôli ktorej modul vznikol: `/(\d+)$/` vytiahlo z čísla
  // OBJ20260001 hodnotu 20260001 aj s rokom a ďalšie číslo vyšlo
  // OBJ202620260002.
  it("nepridá rok druhýkrát", () => {
    expect(dalsieCisloDokladu("OBJ2026", ["OBJ20260001"])).toBe("OBJ20260002");
    expect(dalsieCisloDokladu("Q2026", ["Q20260001"])).toBe("Q20260002");
  });

  it("hľadá maximum číselne, nie abecedne", () => {
    expect(dalsieCisloDokladu("OBJ2026", ["OBJ20269999", "OBJ202610000"])).toBe("OBJ202610001");
  });

  it("čísla z iného roka alebo agendy ignoruje", () => {
    expect(dalsieCisloDokladu("OBJ2026", ["OBJ20250099", "Q20260500", null, undefined])).toBe(
      "OBJ20260001",
    );
  });

  it("pokazené číslo z minulosti nezablokuje ďalšie", () => {
    expect(dalsieCisloDokladu("OBJ2026", ["OBJ202620260002", "OBJ20260001"])).toBe("OBJ20260002");
  });

  it("pri prekročení šírky číslo len narastie", () => {
    expect(dalsieCisloDokladu("OBJ2026", ["OBJ20269999"])).toBe("OBJ202610000");
  });
});
