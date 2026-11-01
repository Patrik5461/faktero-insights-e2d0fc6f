import { describe, expect, it } from "vitest";
import {
  naHromadnuAkciu,
  prepniVsetkyZobrazene,
  vsetkyZobrazeneVybrane,
  vybraneZobrazene,
} from "./vyber-dokladov";

const zaznamy = [{ id: "a" }, { id: "b" }, { id: "c" }];
const zobrazene = zaznamy.slice(0, 2); // filter skryl „c“

describe("Iné doklady – výber len zo zobrazených (H-02, H-03)", () => {
  it("vybraný, ale skrytý riadok sa do akcie nepočíta", () => {
    expect(vybraneZobrazene(new Set(["a", "c"]), zobrazene).map((r) => r.id)).toEqual(["a"]);
  });
  it("bez výberu ide akcia na všetky zobrazené, nie na celú záložku", () => {
    expect(naHromadnuAkciu(new Set(), zobrazene).map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("s výberom ide akcia len na vybrané zobrazené", () => {
    expect(naHromadnuAkciu(new Set(["b", "c"]), zobrazene).map((r) => r.id)).toEqual(["b"]);
  });
  it("Označiť všetky pridá len zobrazené a druhým klikom ich odoberie", () => {
    const raz = prepniVsetkyZobrazene(new Set(), zobrazene);
    expect([...raz].sort()).toEqual(["a", "b"]);
    expect(vsetkyZobrazeneVybrane(raz, zobrazene)).toBe(true);
    expect(prepniVsetkyZobrazene(raz, zobrazene).size).toBe(0);
  });
  it("prázdny zoznam nie je „všetko označené“", () => {
    expect(vsetkyZobrazeneVybrane(new Set(), [])).toBe(false);
  });
});
