import { describe, expect, it } from "vitest";
import {
  MEDZERA,
  ODSTUP,
  OKRAJ_STRANKY,
  REZERVA_VPRAVO,
  SIRKA,
  VYSKA,
  pravyOkrajObsahu,
  zdvihTlacidla,
} from "./ai-tlacidlo-miesto";

const okno = { sirka: 390, vyska: 844 };

describe("zdvihTlacidla", () => {
  it("bez prekážky ostáva dole", () => {
    expect(zdvihTlacidla([], okno)).toBe(0);
  });

  it("nad pätičkou cez celú šírku sa zdvihne s medzerou", () => {
    const lista = { top: 760, bottom: 844, left: 0, right: 390 };
    expect(zdvihTlacidla([lista], okno)).toBe(844 - ODSTUP - 760 + MEDZERA);
  });

  it("lišta mimo miesta tlačidla nevadí", () => {
    const vlavo = { top: 760, bottom: 844, left: 0, right: 200 };
    expect(zdvihTlacidla([vlavo], okno)).toBe(0);
  });

  it("lišta končiaca pred záložkou (okraj stránky a karty) ju nezdvihne", () => {
    const karta = { top: 760, bottom: 844, left: 16, right: 358 };
    expect(zdvihTlacidla([karta], okno)).toBe(0);
  });

  it("horná hlavička sa neráta", () => {
    expect(zdvihTlacidla([{ top: 0, bottom: 844, left: 0, right: 390 }], okno)).toBe(0);
  });

  it("zo viacerých líšt rozhoduje najvyššia", () => {
    const a = { top: 780, bottom: 844, left: 0, right: 390 };
    const b = { top: 700, bottom: 800, left: 300, right: 390 };
    expect(zdvihTlacidla([a, b], okno)).toBe(844 - ODSTUP - 700 + MEDZERA);
  });

  it("tlačidlo neujde nad hornú hlavičku", () => {
    const vysoka = { top: 430, bottom: 844, left: 0, right: 390 };
    expect(zdvihTlacidla([vysoka], okno)).toBeLessThanOrEqual(844 - VYSKA - 2 * ODSTUP - 56);
  });
});

describe("rezerva vpravo pre záložku", () => {
  it("obsah stránky končí pred záložkou aj pri karte s malým okrajom", () => {
    for (const sirka of [320, 360, 390, 430, 639]) {
      const karta = pravyOkrajObsahu(sirka);
      expect(karta).toBeLessThanOrEqual(sirka - SIRKA - 1);
      // Karta p-3 (12 px) + rámček: suma „24,60 €“ končila na 361 px pri 390 px.
      expect(karta - 13).toBeLessThan(sirka - SIRKA);
    }
  });

  it("aj stránka s užším okrajom (px-3) nezasahuje pod záložku", () => {
    expect(pravyOkrajObsahu(390, 12)).toBeLessThanOrEqual(390 - SIRKA);
  });

  it("rezerva nie je zbytočne veľká (obsah nestráca viac než šírku záložky)", () => {
    expect(REZERVA_VPRAVO + OKRAJ_STRANKY).toBeLessThanOrEqual(SIRKA + 8);
  });
});
