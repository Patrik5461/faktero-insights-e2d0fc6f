import { describe, expect, it } from "vitest";
import {
  NOVA_PREDLOHA,
  chybaPredlohy,
  naUlozeniePredlohy,
  popisPredlohy,
  predlohyPreDruh,
  uplatniPredlohu,
} from "./predlohy-uctovania";

const p = (z = {}) => ({
  ...NOVA_PREDLOHA,
  nazov: "Nákup PHM – karta",
  predkontacia: "PHMk",
  ...z,
});

describe("predlohy zaúčtovania", () => {
  it("kontrola: názov a aspoň jedna hodnota", () => {
    expect(chybaPredlohy(p())).toBeNull();
    expect(chybaPredlohy(p({ nazov: " " }))).toMatch(/názov/);
    expect(chybaPredlohy(p({ predkontacia: "" }))).toMatch(/aspoň jednu/);
  });

  it("uloženie: pokladňa len pri bločku", () => {
    expect(naUlozeniePredlohy(p({ druh: "prijata", pokladna: "HP" })).pokladna).toBeNull();
    expect(naUlozeniePredlohy(p({ druh: "blocek", pokladna: " HP " })).pokladna).toBe("HP");
  });

  it("ponuka podľa druhu", () => {
    const zoznam = [
      { ...p({ nazov: "B", druh: "blocek" }), poradie: 2 },
      { ...p({ nazov: "A", druh: null }), poradie: 1 },
      { ...p({ nazov: "V", druh: "vystavena" }) },
    ];
    expect(predlohyPreDruh(zoznam, "blocek").map((x) => x.nazov)).toEqual(["A", "B"]);
    expect(predlohyPreDruh(zoznam, "vystavena").map((x) => x.nazov)).toEqual(["V"]);
    expect(predlohyPreDruh(zoznam, "prijata").map((x) => x.nazov)).toEqual(["A"]);
  });

  it("použitie prepíše len vyplnené a len polia, ktoré formulár má", () => {
    const h = { predkontacia: "X", clenenie: "PD", kv: "", kategoria: "k" };
    const r = uplatniPredlohu(h, p({ kv_clenenie: "B3", rad: "26FP" }));
    expect(r).toEqual({ predkontacia: "PHMk", clenenie: "PD", kv: "B3", kategoria: "k" });
    expect(uplatniPredlohu({ ...h, rad: "" }, p({ rad: "26FP" })).rad).toBe("26FP");
  });

  it("popis", () => {
    expect(popisPredlohy(p({ clenenie_dph: "PD", rad: "26FP" }))).toBe("PHMk / PD / rad 26FP");
  });
});
