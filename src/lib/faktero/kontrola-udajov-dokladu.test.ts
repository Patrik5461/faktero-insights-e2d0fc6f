import { describe, expect, it } from "vitest";
import { dicSediSIcDph, icoMaPlatnuKontrolnuCislicu, upozorneniaUdajov } from "./kontrola-udajov-dokladu";

describe("krížové kontroly prečítaných údajov", () => {
  it("kontrolná číslica IČO", () => {
    expect(icoMaPlatnuKontrolnuCislicu("45952671")).toBe(true); // METRO
    expect(icoMaPlatnuKontrolnuCislicu("356 97 270")).toBe(true); // Orange
    expect(icoMaPlatnuKontrolnuCislicu("00 151 700")).toBe(true); // Allianz
    expect(icoMaPlatnuKontrolnuCislicu("45952672")).toBe(false);
    expect(icoMaPlatnuKontrolnuCislicu("ABC")).toBe(null);
  });

  it("DIČ a IČ DPH toho istého dodávateľa", () => {
    expect(dicSediSIcDph("2023150701", "SK2023150701")).toBe(true);
    expect(dicSediSIcDph("SK2020273893", "SK2023150701")).toBe(false);
    expect(dicSediSIcDph("2023150701", "")).toBe(null);
  });

  it("METRO (RHJ): dátum 2023 pri doklade prijatom v 11/2026 a náhradný model → upozornenia", () => {
    const v = upozorneniaUdajov(
      {
        dodavatel: { ico: "45952672", dic: "SK2020273893", icDph: "SK2023150701", krajina: "SK" },
        datumVystavenia: "2023-10-01",
        datumDodania: "2023-10-01",
        datumPrijatia: "2026-11-10",
      },
      { dnes: "2026-11-16", nahrane: "2026-11-10", ai: { citane_nahradou: "openai" } },
    );
    expect(v.some((x) => x.includes("náhradný model"))).toBe(true);
    expect(v.some((x) => x.includes("kontrolnú číslicu"))).toBe(true);
    expect(v.some((x) => x.includes("nesedia"))).toBe(true);
    expect(v.some((x) => x.includes("Dátum vystavenia 2023-10-01"))).toBe(true);
  });

  it("dátum v budúcnosti; správne údaje bez upozornení", () => {
    expect(upozorneniaUdajov({ datumVystavenia: "2027-01-05" }, { dnes: "2026-11-16" })[0]).toMatch(/v budúcnosti/);
    expect(
      upozorneniaUdajov(
        { dodavatel: { ico: "45952671", dic: "2023150701", icDph: "SK2023150701" }, datumVystavenia: "2026-10-13", datumDodania: "2026-10-13" },
        { dnes: "2026-11-16", nahrane: "2026-11-10", ai: {} },
      ),
    ).toEqual([]);
  });
});
