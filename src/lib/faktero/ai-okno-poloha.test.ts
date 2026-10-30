import { describe, expect, it } from "vitest";
import {
  OKRAJ,
  jeTah,
  ohranicPolohu,
  polohaOknaPriTlacidle,
  precitajPolohu,
} from "./ai-okno-poloha";

const obrazovka = { sirka: 1280, vyska: 800 };
const okno = { sirka: 380, vyska: 560 };

describe("ohranicPolohu", () => {
  it("polohu vnútri obrazovky nechá", () => {
    expect(ohranicPolohu({ x: 300, y: 100 }, okno, obrazovka)).toEqual({ x: 300, y: 100 });
  });

  it("vráti okno späť z ľavého a horného okraja", () => {
    expect(ohranicPolohu({ x: -200, y: -50 }, okno, obrazovka)).toEqual({ x: OKRAJ, y: OKRAJ });
  });

  it("vráti okno späť z pravého a dolného okraja", () => {
    expect(ohranicPolohu({ x: 5000, y: 5000 }, okno, obrazovka)).toEqual({
      x: 1280 - 380 - OKRAJ,
      y: 800 - 560 - OKRAJ,
    });
  });

  it("po zmenšení prehliadača posunie okno, aby ostalo celé vidieť", () => {
    const p = ohranicPolohu({ x: 850, y: 200 }, okno, { sirka: 1000, vyska: 700 });
    expect(p).toEqual({ x: 1000 - 380 - OKRAJ, y: 700 - 560 - OKRAJ });
  });

  it("okno väčšie ako obrazovka prilepí k hornému okraju, aby bola hlavička vidieť", () => {
    expect(ohranicPolohu({ x: 100, y: 300 }, okno, { sirka: 1000, vyska: 400 })).toEqual({
      x: 100,
      y: OKRAJ,
    });
  });

  it("zaokrúhli na celé pixely", () => {
    expect(ohranicPolohu({ x: 10.6, y: 20.2 }, okno, obrazovka)).toEqual({ x: 11, y: 20 });
  });
});

describe("jeTah", () => {
  it("malý pohyb je klik, väčší ťahanie", () => {
    expect(jeTah(0, 0)).toBe(false);
    expect(jeTah(3, 3)).toBe(false);
    expect(jeTah(4, 3)).toBe(true);
    expect(jeTah(-10, 0)).toBe(true);
  });
});

describe("polohaOknaPriTlacidle", () => {
  it("otvorí okno nad tlačidlom, zarovnané vpravo", () => {
    const tlacidlo = { x: 600, y: 700, sirka: 80, vyska: 40 };
    expect(polohaOknaPriTlacidle(tlacidlo, okno, obrazovka)).toEqual({
      x: 600 + 80 - 380,
      y: 700 - 12 - 560,
    });
  });

  it("keď nad tlačidlom nie je miesto, otvorí okno pod ním", () => {
    const tlacidlo = { x: 600, y: 20, sirka: 80, vyska: 40 };
    expect(polohaOknaPriTlacidle(tlacidlo, okno, obrazovka)).toEqual({ x: 300, y: 72 });
  });

  it("tlačidlo pri ľavom okraji neodsunie okno mimo obrazovky", () => {
    const tlacidlo = { x: 10, y: 700, sirka: 80, vyska: 40 };
    expect(polohaOknaPriTlacidle(tlacidlo, okno, obrazovka).x).toBe(OKRAJ);
  });
});

describe("precitajPolohu", () => {
  it("prečíta uloženú polohu", () => {
    expect(precitajPolohu('{"x":12,"y":34}')).toEqual({ x: 12, y: 34 });
  });

  it("nečitateľné hodnoty berie ako pôvodné miesto", () => {
    expect(precitajPolohu(null)).toBeNull();
    expect(precitajPolohu("")).toBeNull();
    expect(precitajPolohu("nie-json")).toBeNull();
    expect(precitajPolohu('{"x":"1","y":2}')).toBeNull();
    expect(precitajPolohu("null")).toBeNull();
    expect(precitajPolohu("[1,2]")).toBeNull();
  });
});
