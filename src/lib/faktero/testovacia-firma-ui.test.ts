import { describe, expect, it } from "vitest";
import { zoradFirmy } from "./poradie-firiem";
import {
  nastaveniaTestovacej,
  skutocnaFirmaPre,
  zoradPrepinacSTestovacimi,
} from "./testovacia-firma-ui";

const A = { id: "a", name: "Alfa s.r.o.", testovacia_pre: null };
const B = { id: "b", name: "Beta s.r.o.", testovacia_pre: null };
const TA = { id: "ta", name: "Test – Alfa s.r.o.", testovacia_pre: "a" };
const TB = { id: "tb", name: "Test – Beta s.r.o.", testovacia_pre: "b" };

describe("prepínač firiem s testovacími", () => {
  it("testovacia ide hneď pod svoju skutočnú, nie abecedne medzi T", () => {
    const z = zoradPrepinacSTestovacimi(zoradFirmy([TB, B, TA, A], "", null, []));
    expect(z.vsetky.map((f) => f.id)).toEqual(["a", "ta", "b", "tb"]);
  });

  it("pri delení na naposledy použité drží testovaciu pri rodičovi v skupine", () => {
    const vela = Array.from({ length: 8 }, (_, i) => ({
      id: `x${i}`,
      name: `Firma ${i}`,
      testovacia_pre: null,
    }));
    const z = zoradPrepinacSTestovacimi(zoradFirmy([...vela, A, TA, B, TB], "", "ta", ["a", "x1"]));
    // naposledy: aktívna testovacia „ta“, „a“, „x1“ → a, ta, x1
    expect(z.posledne.map((f) => f.id)).toEqual(["a", "ta", "x1"]);
    const i = z.ostatne.findIndex((f) => f.id === "b");
    expect(z.ostatne[i + 1].id).toBe("tb");
    expect(z.vsetky).toHaveLength(12);
  });

  it("testovacia bez rodiča vo výsledku hľadania ostane v zozname", () => {
    const z = zoradPrepinacSTestovacimi(zoradFirmy([A, TA, B], "Test", null, []));
    expect(z.vsetky.map((f) => f.id)).toEqual(["ta"]);
  });
});

describe("pás testovacej firmy", () => {
  it("pre skutočnú firmu sa neukazuje", () => {
    expect(skutocnaFirmaPre(A, [A, TA])).toBeNull();
    expect(skutocnaFirmaPre(null, [A])).toBeNull();
  });

  it("pre testovaciu nesie názov a id skutočnej", () => {
    expect(skutocnaFirmaPre(TA, [A, TA])).toEqual({ id: "a", name: "Alfa s.r.o." });
  });

  it("bez rodiča v zozname odvodí názov z predpony a prepnúť nedá", () => {
    expect(skutocnaFirmaPre(TA, [TA])).toEqual({ id: null, name: "Alfa s.r.o." });
  });
});

describe("nastavenia firmy", () => {
  it("skutočná firma: nič sa neskrýva ani neblokuje", () => {
    expect(nastaveniaTestovacej(A, "owner")).toEqual({
      sekcia: false,
      vymazanie: false,
      clenoviaZablokovani: false,
      zmazanieZablokovane: false,
    });
  });

  it("testovacia: sekcia, členovia a mazanie firmy blokované; vymazať smie len správca", () => {
    for (const rola of ["owner", "admin", "accountant"]) {
      expect(nastaveniaTestovacej(TA, rola)).toEqual({
        sekcia: true,
        vymazanie: true,
        clenoviaZablokovani: true,
        zmazanieZablokovane: true,
      });
    }
    expect(nastaveniaTestovacej(TA, "employee").vymazanie).toBe(false);
    expect(nastaveniaTestovacej(TA, "custom").vymazanie).toBe(false);
    expect(nastaveniaTestovacej(TA, null).vymazanie).toBe(false);
    expect(nastaveniaTestovacej(TA, "employee").sekcia).toBe(true);
  });
});
