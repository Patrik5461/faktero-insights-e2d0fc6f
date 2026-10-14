import { describe, expect, it } from "vitest";
import { najdiOkraje, zoradRohy } from "./okraje-dokladu";
import type { Bod, Obraz, Rohy } from "./perspektiva";

/**
 * Detekcia okrajov na umelých obrázkoch: svetlý mnohouholník na tmavom
 * podklade. Skutočná fotka je zložitejšia, ale ak by zlyhalo už toto,
 * na telefóne by obrys nesedel nikdy.
 */

/** Je bod vnútri konvexného mnohouholníka (body v smere hodinových ručičiek)? */
function vnutri(p: Bod, poly: Bod[]): boolean {
  let znamienko = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const k = Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    if (k && znamienko && k !== znamienko) return false;
    if (k) znamienko = k;
  }
  return true;
}

function obraz(sirka: number, vyska: number, poly: Bod[] | null, sum = 0): Obraz {
  const data = new Uint8ClampedArray(sirka * vyska * 4);
  let seed = 7;
  const nahoda = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * sum;
  for (let y = 0; y < vyska; y++)
    for (let x = 0; x < sirka; x++) {
      const i = (y * sirka + x) * 4;
      const v = (poly && vnutri({ x: x + 0.5, y: y + 0.5 }, poly) ? 235 : 45) + nahoda();
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  return { data, width: sirka, height: vyska };
}

function blizko(najdene: Rohy | null, ocakavane: Bod[], tolerancia: number) {
  expect(najdene).not.toBeNull();
  for (const o of ocakavane) {
    const d = Math.min(...najdene!.map((b) => Math.hypot(b.x - o.x, b.y - o.y)));
    expect(d).toBeLessThan(tolerancia);
  }
}

describe("okraje dokladu", () => {
  it("nájde biely obdĺžnik na tmavom podklade", () => {
    const rohy = [
      { x: 60, y: 40 },
      { x: 260, y: 40 },
      { x: 260, y: 200 },
      { x: 60, y: 200 },
    ];
    const r = najdiOkraje(obraz(320, 240, rohy, 20));
    blizko(r, rohy, 4);
    // Poradie: ľavý horný, pravý horný, pravý dolný, ľavý dolný.
    expect(r![0].x).toBeLessThan(r![1].x);
    expect(r![1].y).toBeLessThan(r![2].y);
    expect(r![3].x).toBeLessThan(r![2].x);
  });

  it("nájde doklad v perspektíve (lichobežník) aj otočený kosoštvorec", () => {
    const lichobeznik = [
      { x: 90, y: 30 },
      { x: 230, y: 40 },
      { x: 290, y: 220 },
      { x: 30, y: 210 },
    ];
    blizko(najdiOkraje(obraz(320, 240, lichobeznik, 10)), lichobeznik, 5);

    const kosostvorec = [
      { x: 160, y: 20 },
      { x: 290, y: 120 },
      { x: 160, y: 220 },
      { x: 30, y: 120 },
    ];
    blizko(najdiOkraje(obraz(320, 240, kosostvorec)), kosostvorec, 5);
  });

  it("prázdny obraz, malý fľak ani kruh nie sú doklad", () => {
    expect(najdiOkraje(obraz(320, 240, null))).toBeNull();
    expect(najdiOkraje(obraz(320, 240, null, 30))).toBeNull();
    const maly = [
      { x: 140, y: 100 },
      { x: 180, y: 100 },
      { x: 180, y: 130 },
      { x: 140, y: 130 },
    ];
    expect(najdiOkraje(obraz(320, 240, maly))).toBeNull();
    const kruh = Array.from({ length: 64 }, (_, i) => ({
      x: 160 + 100 * Math.cos((i / 64) * 2 * Math.PI),
      y: 120 + 100 * Math.sin((i / 64) * 2 * Math.PI),
    }));
    expect(najdiOkraje(obraz(320, 240, kruh))).toBeNull();
  });

  it("zoradí rohy bez ohľadu na poradie na vstupe", () => {
    const r = zoradRohy([
      { x: 10, y: 90 },
      { x: 90, y: 10 },
      { x: 10, y: 10 },
      { x: 90, y: 90 },
    ]);
    expect(r).toEqual([
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ]);
  });
});
