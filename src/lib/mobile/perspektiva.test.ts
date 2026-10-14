import { describe, expect, it } from "vitest";
import {
  homografia,
  otocRohy,
  pouziFilter,
  rozmerVystupu,
  vyrovnaj,
  zobraz,
  type Obraz,
  type Rohy,
} from "./perspektiva";

const obdlznik = (s: number, v: number): Rohy => [
  { x: 0, y: 0 },
  { x: s, y: 0 },
  { x: s, y: v },
  { x: 0, y: v },
];

describe("homografia", () => {
  it("zobrazí rohy presne na rohy", () => {
    const z = obdlznik(100, 150);
    const na: Rohy = [
      { x: 12, y: 30 },
      { x: 410, y: 8 },
      { x: 450, y: 600 },
      { x: 0, y: 560 },
    ];
    const h = homografia(z, na)!;
    for (let i = 0; i < 4; i++) {
      const b = zobraz(h, z[i]);
      expect(b.x).toBeCloseTo(na[i].x, 6);
      expect(b.y).toBeCloseTo(na[i].y, 6);
    }
    // Stred obdĺžnika ide na priesečník uhlopriečok štvoruholníka.
    const stred = zobraz(h, { x: 50, y: 75 });
    expect(stred.x).toBeGreaterThan(150);
    expect(stred.x).toBeLessThan(300);
  });

  it("pri rovnakom obdĺžniku je to identita", () => {
    const h = homografia(obdlznik(200, 300), obdlznik(200, 300))!;
    const b = zobraz(h, { x: 37, y: 211 });
    expect(b.x).toBeCloseTo(37, 9);
    expect(b.y).toBeCloseTo(211, 9);
  });

  it("tri body na priamke sa vyriešiť nedajú", () => {
    const zle: Rohy = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    expect(homografia(obdlznik(10, 10), zle)).toBeNull();
  });
});

describe("vyrovnanie", () => {
  function sachovnica(s: number, v: number): Obraz {
    const data = new Uint8ClampedArray(s * v * 4);
    for (let y = 0; y < v; y++)
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        data[i] = x;
        data[i + 1] = y;
        data[i + 2] = ((x >> 3) + (y >> 3)) % 2 ? 255 : 0;
        data[i + 3] = 255;
      }
    return { data, width: s, height: v };
  }

  it("rozmer podľa dlhších strán, najviac 2400 px", () => {
    expect(rozmerVystupu(obdlznik(300, 400))).toEqual({ sirka: 300, vyska: 400 });
    const velky = rozmerVystupu(obdlznik(3000, 4000));
    expect(velky.vyska).toBe(2400);
    expect(velky.sirka).toBe(1800);
  });

  it("obdĺžnik cez celý obraz vráti ten istý obraz", async () => {
    const zdroj = sachovnica(64, 48);
    let prestavky = 0;
    const vystup = await vyrovnaj(zdroj, obdlznik(64, 48), {
      riadkovNaraz: 10,
      prestavka: async () => void prestavky++,
    });
    expect(vystup.width).toBe(64);
    expect(vystup.height).toBe(48);
    expect(prestavky).toBe(4);
    expect(Array.from(vystup.data)).toEqual(Array.from(zdroj.data));
  });

  it("výrez sa vytiahne zo správneho miesta", async () => {
    const zdroj = sachovnica(200, 200);
    const rohy: Rohy = [
      { x: 50, y: 60 },
      { x: 150, y: 60 },
      { x: 150, y: 160 },
      { x: 50, y: 160 },
    ];
    const v = await vyrovnaj(zdroj, rohy);
    expect(v.width).toBe(100);
    // Červená = x, zelená = y zdroja.
    expect(v.data[0]).toBe(50);
    expect(v.data[1]).toBe(60);
    const i = (99 * 100 + 99) * 4;
    expect(v.data[i]).toBe(149);
    expect(v.data[i + 1]).toBe(159);
  });
});

describe("otočenie a filtre", () => {
  it("otočenie o 90° posunie rohy aj ich poradie", () => {
    // Obrázok 100×50, doklad vľavo hore.
    const r: Rohy = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
      { x: 0, y: 20 },
    ];
    expect(otocRohy(r, 50)).toEqual([
      { x: 30, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 30, y: 40 },
    ]);
  });

  it("čiernobiely urobí sivú, pôvodný nemení nič", () => {
    const obr = { data: new Uint8ClampedArray([200, 50, 50, 255]), width: 1, height: 1 };
    pouziFilter(obr, "povodny");
    expect(Array.from(obr.data)).toEqual([200, 50, 50, 255]);
    pouziFilter(obr, "ciernobiely");
    expect(obr.data[0]).toBe(obr.data[1]);
    expect(obr.data[1]).toBe(obr.data[2]);
  });
});
