import { describe, expect, it } from "vitest";
import {
  prepniVsetkyZobrazene,
  vsetkyZobrazeneVybrane,
  vybraneZobrazene,
} from "./vyber-zobrazenych";

type R = { id: string; navrh: boolean };
const kluc = (r: R) => r.id;

describe("vybraneZobrazene (E-23)", () => {
  it("počíta len zobrazené vybrané s návrhom", () => {
    const zobrazene: R[] = [
      { id: "a", navrh: true },
      { id: "b", navrh: false },
      { id: "c", navrh: true },
    ];
    // „x“ je vybrané, ale filter ho skryl.
    const vybrane = new Set(["a", "b", "x"]);
    expect(vybraneZobrazene(zobrazene, vybrane, kluc, (r) => r.navrh).map(kluc)).toEqual(["a"]);
    expect(vybraneZobrazene(zobrazene, vybrane, kluc).map(kluc)).toEqual(["a", "b"]);
  });
});

describe("prepniVsetkyZobrazene (E-24)", () => {
  it("pridá zobrazené a výber z iného filtra nechá", () => {
    const r = prepniVsetkyZobrazene(new Set(["x"]), ["a", "b"]);
    expect([...r].sort()).toEqual(["a", "b", "x"]);
  });
  it("keď sú všetky zobrazené vybrané, odoberie len ich", () => {
    const r = prepniVsetkyZobrazene(new Set(["a", "b", "x"]), ["a", "b"]);
    expect([...r]).toEqual(["x"]);
  });
  it("prázdny zoznam nie je „všetko vybrané“", () => {
    expect(vsetkyZobrazeneVybrane([], new Set(["a"]))).toBe(false);
  });
});
