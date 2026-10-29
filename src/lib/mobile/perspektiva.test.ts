import { describe, expect, it } from "vitest";
import {
  homografia,
  otocRohy,
  pomerStran,
  pouziFilter,
  rozmerVystupu,
  usporiadajRohy,
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

describe("pomer strán a poradie rohov", () => {
  /*
    Obdĺžnik s × v v rovine stola, telefón nad ním naklonený o `skx` okolo
    vodorovnej a `sky` okolo zvislej osi, premietnutý kamerou s ohniskovou
    `f` (v pixeloch) na obraz w × h. Rohy v poradí ĽH, PH, PD, ĽD.
  */
  function premietni(
    s: number,
    v: number,
    skx: number,
    sky: number,
    f: number,
    w: number,
    h: number,
    // Doklad mimo stredu záberu (v rovine stola).
    posun = { x: 0, y: 0 },
  ): Rohy {
    const body = [
      [posun.x - s / 2, posun.y - v / 2],
      [posun.x + s / 2, posun.y - v / 2],
      [posun.x + s / 2, posun.y + v / 2],
      [posun.x - s / 2, posun.y + v / 2],
    ];
    return body.map(([x0, y0]) => {
      // Najprv okolo osi x, potom okolo osi y.
      const y1 = y0 * Math.cos(skx);
      const z1 = y0 * Math.sin(skx);
      const x2 = x0 * Math.cos(sky) + z1 * Math.sin(sky);
      const z2 = -x0 * Math.sin(sky) + z1 * Math.cos(sky);
      const z = z2 + 3 * Math.max(s, v);
      return { x: w / 2 + (f * x2) / z, y: h / 2 + (f * y1) / z };
    }) as Rohy;
  }

  it("rovno odfotený obdĺžnik má presne svoj pomer", () => {
    expect(pomerStran(obdlznik(300, 900), 1080, 1920)).toBeCloseTo(1 / 3, 6);
  });

  it("naklonený dlhý bloček nevyjde zavalitý", () => {
    // Bloček 8 × 30 cm, telefón naklonený o 35° — bočné strany sú skrátené.
    const w = 1080;
    const h = 1920;
    const rohy = premietni(80, 300, (35 * Math.PI) / 180, 0, 0.8 * 1920, w, h);
    const [lh, ph, pd, ld] = rohy;
    const d = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);
    const priemer = (d(lh, ph) + d(ld, pd)) / (d(lh, ld) + d(ph, pd));
    const skutocny = 80 / 300;
    // Priemer strán sa mýli o viac než 15 %, výpočet cez kameru do 2 %.
    expect(Math.abs(priemer / skutocny - 1)).toBeGreaterThan(0.15);
    expect(pomerStran(rohy, w, h) / skutocny).toBeCloseTo(1, 1);
    expect(Math.abs(pomerStran(rohy, w, h) / skutocny - 1)).toBeLessThan(0.02);
  });

  it("pri dvoch úbežníkoch zistí ohniskovú sám", () => {
    // Iná ohnisková než predvolená — musí ju zistiť z rohov.
    const rohy = premietni(210, 297, 0.6, 0.35, 1.3 * 1920, 1080, 1920);
    expect(Math.abs(pomerStran(rohy, 1080, 1920) / (210 / 297) - 1)).toBeLessThan(0.02);
    // Aj keď doklad neleží v strede záberu.
    const bokom = premietni(210, 297, 0.5, 0.3, 1.1 * 1920, 1080, 1920, { x: 60, y: -90 });
    expect(Math.abs(pomerStran(bokom, 1080, 1920) / (210 / 297) - 1)).toBeLessThan(0.02);
  });

  it("rozmer výstupu drží pomer a dlhšiu stranu", () => {
    const rohy = premietni(80, 300, 0.6, 0, 0.8 * 1920, 1080, 1920);
    const r = rozmerVystupu(rohy, 2400, { sirka: 1080, vyska: 1920 });
    expect(r.sirka / r.vyska).toBeCloseTo(80 / 300, 1);
    expect(Math.abs(r.sirka / r.vyska / (80 / 300) - 1)).toBeLessThan(0.03);
  });

  it("nezmyselný štvoruholník nespadne, vráti priemer strán", () => {
    const r = pomerStran(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      100,
      100,
    );
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBeGreaterThan(0);
  });

  it("prekrížené rohy zoradí, správne nechá tak", () => {
    const dobre = obdlznik(100, 200);
    expect(usporiadajRohy(dobre)).toBe(dobre);
    const prekrizene: Rohy = [dobre[1], dobre[0], dobre[2], dobre[3]];
    expect(usporiadajRohy(prekrizene)).toEqual(dobre);
    const zrkadlo: Rohy = [dobre[0], dobre[3], dobre[2], dobre[1]];
    expect(usporiadajRohy(zrkadlo)).toEqual(dobre);
  });
});
