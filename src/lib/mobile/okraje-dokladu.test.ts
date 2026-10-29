import { describe, expect, it } from "vitest";
import {
  kandidatiDokladu,
  najdiDoklad,
  najdiOkraje,
  OKRAJ_NAVYSE,
  zoradRohy,
} from "./okraje-dokladu";
import type { Bod, Obraz, Rohy } from "./perspektiva";

/**
 * Detekcia okrajov na umelých obrázkoch. Skutočná fotka je zložitejšia
 * (na tých sa to ladilo), ale ak by zlyhalo už toto, na telefóne by obrys
 * nesedel nikdy. Každý prípad zodpovedá niečomu, čo sa na fotkách bločkov
 * naozaj stáva.
 */

/**
 * Znamienková vzdialenosť od konvexného mnohouholníka (body v smere
 * hodinových ručičiek na obrazovke): kladná vnútri, záporná vonku.
 */
function vzdialenost(p: Bod, poly: Bod[]): number {
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dl = Math.hypot(b.x - a.x, b.y - a.y);
    const d = ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / dl;
    if (d < min) min = d;
  }
  return min;
}

type Scena = {
  sirka?: number;
  vyska?: number;
  /** Doklad; `null` = bez dokladu. */
  poly: Bod[] | null;
  papier?: number;
  podklad?: number;
  /** Šírka prechodu na hrane v pixeloch (rozostrenie). */
  makka?: number;
  sum?: number;
  /** Úprava jasu podľa polohy (tieň, odlesk). */
  svetlo?: (x: number, y: number, v: number, naPapieri: boolean) => number;
};

function obraz({
  sirka = 320,
  vyska = 240,
  poly,
  papier = 235,
  podklad = 45,
  makka = 0.5,
  sum = 0,
  svetlo,
}: Scena): Obraz {
  const data = new Uint8ClampedArray(sirka * vyska * 4);
  let seed = 7;
  const nahoda = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * sum;
  for (let y = 0; y < vyska; y++)
    for (let x = 0; x < sirka; x++) {
      const i = (y * sirka + x) * 4;
      const d = poly ? vzdialenost({ x: x + 0.5, y: y + 0.5 }, poly) : -1e9;
      const t = Math.max(0, Math.min(1, 0.5 + d / (2 * makka)));
      let v = podklad + (papier - podklad) * t;
      if (svetlo) v = svetlo(x, y, v, t > 0.5);
      v += nahoda();
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  return { data, width: sirka, height: vyska };
}

/** Každý očakávaný roh má blízko nájdený roh. */
function blizko(najdene: Rohy | null, ocakavane: Bod[], tolerancia: number) {
  expect(najdene).not.toBeNull();
  for (const o of ocakavane) {
    const d = Math.min(...najdene!.map((b) => Math.hypot(b.x - o.x, b.y - o.y)));
    expect(d).toBeLessThan(tolerancia);
  }
}

/** Obdĺžnik v smere hodinových ručičiek. */
const obdlznik = (x0: number, y0: number, x1: number, y1: number): Bod[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

// Nájdený obrys je o kúsok väčší (okraj navyše), roh sa posunie zhruba o √2 × okraj.
const OKRAJ = OKRAJ_NAVYSE * 320;
const TOL = OKRAJ * 1.5 + 3;

describe("okraje dokladu", () => {
  it("nájde biely obdĺžnik na tmavom podklade v správnom poradí rohov", () => {
    const rohy = obdlznik(60, 40, 260, 200);
    const r = najdiOkraje(obraz({ poly: rohy, sum: 20 }));
    blizko(r, rohy, TOL);
    // Poradie: ľavý horný, pravý horný, pravý dolný, ľavý dolný.
    expect(r![0].x).toBeLessThan(r![1].x);
    expect(r![1].y).toBeLessThan(r![2].y);
    expect(r![3].x).toBeLessThan(r![2].x);
  });

  it("pridá malý okraj, aby text pri hrane neutiekol", () => {
    const rohy = obdlznik(60, 40, 260, 200);
    const r = najdiOkraje(obraz({ poly: rohy }))!;
    expect(r[0].x).toBeLessThan(60);
    expect(r[0].y).toBeLessThan(40);
    expect(r[2].x).toBeGreaterThan(260);
    expect(r[2].y).toBeGreaterThan(200);
    expect(r[0].x).toBeGreaterThan(60 - 2 * OKRAJ - 2);
  });

  it("nájde doklad v perspektíve (lichobežník) aj otočený kosoštvorec", () => {
    const lichobeznik = [
      { x: 90, y: 30 },
      { x: 230, y: 40 },
      { x: 290, y: 220 },
      { x: 30, y: 210 },
    ];
    blizko(najdiOkraje(obraz({ poly: lichobeznik, sum: 10 })), lichobeznik, TOL + 2);

    const kosostvorec = [
      { x: 160, y: 20 },
      { x: 290, y: 120 },
      { x: 160, y: 220 },
      { x: 30, y: 120 },
    ];
    blizko(najdiOkraje(obraz({ poly: kosostvorec })), kosostvorec, TOL + 3);
  });

  it("nájde mierne pootočený bloček", () => {
    const u = (8 * Math.PI) / 180;
    const stred = { x: 120, y: 160 };
    const rohy = [
      [-45, -130],
      [45, -130],
      [45, 130],
      [-45, 130],
    ].map(([x, y]) => ({
      x: stred.x + x * Math.cos(u) - y * Math.sin(u),
      y: stred.y + x * Math.sin(u) + y * Math.cos(u),
    }));
    blizko(najdiOkraje(obraz({ sirka: 240, vyska: 320, poly: rohy, sum: 15 })), rohy, TOL + 2);
  });

  it("nájde úzky dlhý bloček, hoci zaberá len desatinu obrazu", () => {
    // 30 × 260 px v obraze 240 × 320 — necelých 10 % plochy.
    const rohy = obdlznik(105, 30, 135, 290);
    blizko(najdiOkraje(obraz({ sirka: 240, vyska: 320, poly: rohy, sum: 10 })), rohy, TOL);
  });

  it("nájde biely bloček na svetlom stole s jemnou hranou", () => {
    const rohy = obdlznik(70, 30, 250, 215);
    const r = najdiOkraje(obraz({ poly: rohy, papier: 245, podklad: 190, makka: 3, sum: 8 }));
    blizko(r, rohy, TOL + 2);
  });

  it("sivastý termopapier na tmavom podklade", () => {
    const rohy = obdlznik(80, 20, 230, 225);
    blizko(najdiOkraje(obraz({ poly: rohy, papier: 150, podklad: 60, sum: 12 })), rohy, TOL);
  });

  it("tieň cez polovicu bločku ho nerozdelí", () => {
    // Svetlý sivý stôl je rovnako jasný ako papier v tieni — jeden prah
    // na celý obraz to buď rozdelí, alebo prilepí stôl.
    const rohy = obdlznik(90, 20, 150, 300);
    const r = najdiOkraje(
      obraz({
        sirka: 240,
        vyska: 320,
        poly: rohy,
        papier: 235,
        podklad: 120,
        sum: 6,
        svetlo: (x, y, v) => (y > 160 ? v * 0.52 : v),
      }),
    );
    blizko(r, rohy, TOL + 3);
  });

  it("zvlnený (pokrčený) okraj nevadí", () => {
    // Dlhé strany sa vlnia o ±3 px.
    const poly: Bod[] = [];
    for (let y = 30; y <= 290; y += 5) poly.push({ x: 150 + 3 * Math.sin(y / 9), y });
    for (let y = 290; y >= 30; y -= 5) poly.push({ x: 90 + 3 * Math.sin(y / 7), y });
    const data = obraz({ sirka: 240, vyska: 320, poly: null, sum: 8 });
    // Mnohouholník nie je konvexný — vyfarbí sa po riadkoch.
    for (let y = 0; y < 320; y++) {
      const l = 90 + 3 * Math.sin((y + 0.5) / 7);
      const p = 150 + 3 * Math.sin((y + 0.5) / 9);
      if (y < 30 || y >= 290) continue;
      for (let x = Math.ceil(l); x < p; x++) {
        const i = (y * 240 + x) * 4;
        data.data[i] = data.data[i + 1] = data.data[i + 2] = 232;
      }
    }
    blizko(najdiOkraje(data), obdlznik(90, 30, 150, 290), TOL + 4);
  });

  it("bloček, ktorý trčí zo záberu, sa nájde až po okraj obrazu", () => {
    const r = najdiOkraje(obraz({ sirka: 240, vyska: 320, poly: obdlznik(70, 60, 170, 400) }));
    blizko(
      r,
      [
        { x: 70, y: 60 },
        { x: 170, y: 60 },
        { x: 170, y: 320 },
        { x: 70, y: 320 },
      ],
      TOL,
    );
  });

  it("odlesk prilepený k bločku obrys neroztiahne", () => {
    const rohy = obdlznik(80, 30, 150, 290);
    // Svetlá škvrna na stole tesne vedľa bločku (lampa v lesklom stole).
    const r = najdiOkraje(
      obraz({
        sirka: 240,
        vyska: 320,
        poly: rohy,
        sum: 6,
        svetlo: (x, y, v, naPapieri) =>
          !naPapieri && Math.hypot(x - 185, y - 200) < 40 && x >= 150 ? 205 : v,
      }),
    );
    // Buď správny bloček, alebo radšej nič — ale nikdy obrys cez odlesk.
    if (r) blizko(r, rohy, TOL + 3);
  });

  it("prázdny obraz, šum, malý fľak ani kruh nie sú doklad", () => {
    expect(najdiOkraje(obraz({ poly: null }))).toBeNull();
    expect(najdiOkraje(obraz({ poly: null, sum: 30 }))).toBeNull();
    expect(najdiOkraje(obraz({ poly: obdlznik(140, 100, 170, 125) }))).toBeNull();
    const kruh = Array.from({ length: 64 }, (_, i) => ({
      x: 160 + 100 * Math.cos((i / 64) * 2 * Math.PI),
      y: 120 + 100 * Math.sin((i / 64) * 2 * Math.PI),
    }));
    expect(najdiOkraje(obraz({ poly: kruh }))).toBeNull();
  });

  it("naskenovaný doklad cez celý záber nevráti obrys (orezávať netreba)", () => {
    // Papier až po okraje, len tmavý pásik vľavo.
    expect(najdiOkraje(obraz({ poly: obdlznik(12, -5, 330, 250), sum: 10 }))).toBeNull();
  });

  it("vráti istotu a kandidátov na ladenie", () => {
    const obr = obraz({ poly: obdlznik(60, 40, 260, 200), sum: 10 });
    const d = najdiDoklad(obr)!;
    expect(d.istota).toBeGreaterThan(0.9);
    expect(d.istota).toBeLessThanOrEqual(1);
    const k = kandidatiDokladu(obr);
    expect(k.length).toBeGreaterThan(0);
    expect(k.some((x) => !x.dovod)).toBe(true);
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
