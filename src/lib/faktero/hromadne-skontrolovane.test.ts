import { describe, expect, it } from "vitest";
import { cakaNaKontrolu, vybraneNaKontrolu, ZMENA_SKONTROLOVANE } from "./hromadne-skontrolovane";

describe("hromadné Skontrolované", () => {
  it("na kontrolu čaká len doklad s na_kontrolu_at, ktorý nie je v koši", () => {
    expect(cakaNaKontrolu({ id: "a", na_kontrolu_at: "2026-11-01T10:00:00Z" })).toBe(true);
    expect(cakaNaKontrolu({ id: "a", na_kontrolu_at: null })).toBe(false);
    expect(cakaNaKontrolu({ id: "a" })).toBe(false);
    expect(
      cakaNaKontrolu({ id: "a", na_kontrolu_at: "2026-11-01", deleted_at: "2026-11-02" }),
    ).toBe(false);
    expect(cakaNaKontrolu(null)).toBe(false);
  });

  it("z označených vyberie len tie na kontrolu", () => {
    const riadky = [
      { id: "1", na_kontrolu_at: "2026-11-01" },
      { id: "2", na_kontrolu_at: null },
      { id: "3", na_kontrolu_at: "2026-11-03" },
      { id: "4", na_kontrolu_at: "2026-11-04" },
    ];
    expect(vybraneNaKontrolu(riadky, new Set(["1", "2", "3"]))).toEqual(["1", "3"]);
    expect(vybraneNaKontrolu(riadky, new Set(["2"]))).toEqual([]);
    expect(vybraneNaKontrolu(riadky, new Set())).toEqual([]);
  });

  it("zmaže čas aj dôvod kontroly ako tlačidlo na detaile", () => {
    expect(ZMENA_SKONTROLOVANE).toEqual({ na_kontrolu_at: null, na_kontrolu_dovod: null });
  });
});
