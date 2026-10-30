import { readFileSync } from "node:fs";
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

/*
  Akcia, po ktorej človek ostane na tej istej stránke, sa v odznakoch
  neprejaví, kým neodíde alebo neuplynie minúta — preto musia stránky po nej
  zavolať `obnovPoctyMenu()`. Kontrola, že to nikto omylom nevyhodí.
*/
describe("obnovPoctyMenu po akciách na stránke", () => {
  const stranky = [
    "src/routes/_authenticated/doklady.index.tsx",
    "src/routes/_authenticated/nespracovane.index.tsx",
    "src/routes/_authenticated/efaktura.prijate.tsx",
    "src/routes/_authenticated/moje-ulohy.tsx",
    "src/routes/_authenticated/schvalovanie.tsx",
    "src/components/faktero/SchvalovaniePanel.tsx",
  ];
  it.each(stranky)("%s volá obnovPoctyMenu()", (subor) => {
    const kod = readFileSync(subor, "utf8");
    expect(kod).toMatch(/obnovPoctyMenu\(\)/);
  });
});
