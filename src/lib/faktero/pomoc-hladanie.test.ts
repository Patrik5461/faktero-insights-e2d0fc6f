import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hladajVManualoch, type Clanok } from "./pomoc-hladanie";

const clanky = (
  JSON.parse(readFileSync(new URL("./znalosti-manualy.json", import.meta.url), "utf8")) as {
    clanky: Clanok[];
  }
).clanky;

describe("hľadanie v manuáloch", () => {
  it("nájde manuál bez ohľadu na diakritiku", () => {
    const r = hladajVManualoch(clanky, "hromadny prikaz na uhradu");
    expect(r[0]?.cesta).toBe("/pomoc/prijate-faktury");
  });

  it("WooCommerce vedie na svoj návod", () => {
    expect(hladajVManualoch(clanky, "WooCommerce")[0]?.cesta).toBe("/pomoc/woocommerce");
  });

  it("ukážka je čistý text so slovom, ktoré sa hľadalo", () => {
    const r = hladajVManualoch(clanky, "predkontácia")[0]!;
    expect(r.ukazka).not.toMatch(/[<>]/);
    expect(r.ukazka.toLowerCase()).toContain("predkont");
  });

  it("krátke slová a prázdna otázka nič nevrátia", () => {
    expect(hladajVManualoch(clanky, "a v")).toEqual([]);
    expect(hladajVManualoch(clanky, "")).toEqual([]);
  });
});
