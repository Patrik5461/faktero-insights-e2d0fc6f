import { describe, expect, it } from "vitest";
import { POCTY_PLATIA_MS, trebaObnovitPocty } from "./pocty-menu";

describe("trebaObnovitPocty", () => {
  it("prvé zobrazenie načíta vždy", () => {
    expect(trebaObnovitPocty(null, "/dashboard", 0)).toBe(true);
  });

  it("tá istá cesta nenačíta", () => {
    expect(trebaObnovitPocty("/nespracovane", "/nespracovane", 999_999)).toBe(false);
  });

  it("odchod zo stránky s dokladmi načíta hneď", () => {
    expect(trebaObnovitPocty("/nespracovane", "/dashboard", 1_000)).toBe(true);
    expect(trebaObnovitPocty("/doklady/abc", "/odberatelia", 1_000)).toBe(true);
    expect(trebaObnovitPocty("/efaktura/prijate", "/dashboard", 1_000)).toBe(true);
    expect(trebaObnovitPocty("/moje-ulohy", "/faktury", 1_000)).toBe(true);
  });

  it("medzi pokojnými stránkami len po vypršaní", () => {
    expect(trebaObnovitPocty("/odberatelia", "/produkty", 1_000)).toBe(false);
    expect(trebaObnovitPocty("/odberatelia", "/produkty", POCTY_PLATIA_MS + 1)).toBe(true);
  });

  it("predpona musí byť celý úsek cesty", () => {
    expect(trebaObnovitPocty("/fakturyx", "/produkty", 1_000)).toBe(false);
  });
});
