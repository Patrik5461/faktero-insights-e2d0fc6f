import { describe, expect, it } from "vitest";
import type { Rohy } from "./perspektiva";
import {
  dalsiObrys,
  HISTORIA_OBRYSU,
  medianRohov,
  najvacsiPosun,
  PRAZDNY_OBRYS,
  vyberRohyFotky,
  type StavObrysu,
  type Vzorka,
} from "./orez-dokladu";

const SIRKA = 1080;
const VYSKA = 1920;

const obdlznik = (x: number, y: number, s: number, v: number): Rohy => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + v },
  { x, y: y + v },
];
const vzorka = (rohy: Rohy): Vzorka => ({ rohy, sirka: SIRKA, vyska: VYSKA });
const posunute = (r: Rohy, dx: number, dy = 0): Rohy =>
  r.map((b) => ({ x: b.x + dx, y: b.y + dy })) as Rohy;

describe("živý obrys", () => {
  const zaklad = obdlznik(200, 300, 600, 1200);

  it("prvá detekcia sa ukáže hneď", () => {
    const s = dalsiObrys(PRAZDNY_OBRYS, vzorka(zaklad));
    expect(s.zobrazene?.rohy).toEqual(zaklad);
  });

  it("drobné trasenie obrys nepohne", () => {
    let s = dalsiObrys(PRAZDNY_OBRYS, vzorka(zaklad));
    for (const dx of [6, -5, 8, -7, 4]) {
      const pred = s;
      s = dalsiObrys(s, vzorka(posunute(zaklad, dx)));
      expect(s.zobrazene?.rohy).toBe(pred.zobrazene?.rohy);
      // Nový objekt — automatické odfotenie počíta rámce po jednom.
      expect(s).not.toBe(pred);
      expect(s.zobrazene).not.toBe(pred.zobrazene);
    }
  });

  it("jeden ujdený rámec obrys neodtiahne (medián)", () => {
    let s: StavObrysu = PRAZDNY_OBRYS;
    for (let i = 0; i < HISTORIA_OBRYSU; i++) s = dalsiObrys(s, vzorka(zaklad));
    // 120 px vedľa — pod veľkým skokom, ale ďaleko nad trasením.
    s = dalsiObrys(s, vzorka(posunute(zaklad, 120)));
    expect(najvacsiPosun(s.zobrazene!.rohy, zaklad)).toBeLessThan(1);
  });

  it("pomalý posun obrys dobehne", () => {
    let s = dalsiObrys(PRAZDNY_OBRYS, vzorka(zaklad));
    for (let i = 0; i < 6; i++) s = dalsiObrys(s, vzorka(posunute(zaklad, 80)));
    expect(najvacsiPosun(s.zobrazene!.rohy, posunute(zaklad, 80))).toBeLessThan(1);
  });

  it("veľký skok preskočí hneď, bez dobiehania", () => {
    let s = dalsiObrys(PRAZDNY_OBRYS, vzorka(zaklad));
    s = dalsiObrys(s, vzorka(zaklad));
    const inde = posunute(zaklad, 0, 400);
    s = dalsiObrys(s, vzorka(inde));
    expect(s.zobrazene?.rohy).toEqual(inde);
    expect(s.historia).toHaveLength(1);
  });

  it("zhasne až po dvoch prázdnych rámcoch", () => {
    let s = dalsiObrys(PRAZDNY_OBRYS, vzorka(zaklad));
    s = dalsiObrys(s, null);
    expect(s.zobrazene).not.toBeNull();
    s = dalsiObrys(s, vzorka(zaklad));
    s = dalsiObrys(s, null);
    expect(s.zobrazene).not.toBeNull();
    s = dalsiObrys(s, null);
    expect(s.zobrazene).toBeNull();
  });

  it("iný rozmer videa (otočenie) začne odznova", () => {
    let s = dalsiObrys(PRAZDNY_OBRYS, vzorka(zaklad));
    const otocene: Vzorka = { rohy: obdlznik(10, 10, 500, 300), sirka: VYSKA, vyska: SIRKA };
    s = dalsiObrys(s, otocene);
    expect(s.zobrazene).toEqual(otocene);
  });

  it("medián rohov", () => {
    const m = medianRohov([zaklad, posunute(zaklad, 10), posunute(zaklad, 500)]);
    expect(m[0].x).toBe(210);
  });
});

describe("rohy po odfotení", () => {
  const naFotke = obdlznik(200, 300, 600, 1200);

  it("vyhráva detekcia na fotke, ďalšie pokusy sa už nevolajú", () => {
    let volane = 0;
    const r = vyberRohyFotky(
      [() => naFotke, () => (volane++, null)],
      vzorka(posunute(naFotke, 20)),
      SIRKA,
      VYSKA,
    );
    expect(r).toBe(naFotke);
    expect(volane).toBe(0);
  });

  it("keď ostrá detekcia nesedí s obrysom, skúsi sa ďalšia", () => {
    const zle = obdlznik(500, 900, 200, 200);
    const r = vyberRohyFotky([() => zle, () => naFotke], vzorka(naFotke), SIRKA, VYSKA);
    expect(r).toBe(naFotke);
  });

  it("keď nesedí žiadna, ruka sa pohla — vyhráva fotka", () => {
    const inde = obdlznik(100, 100, 600, 1200);
    const r = vyberRohyFotky(
      [() => inde, () => null],
      vzorka(posunute(inde, 0, 500)),
      SIRKA,
      VYSKA,
    );
    expect(r).toBe(inde);
  });

  it("fotka nedá nič — posledný obrys, prepočítaný na rozmer fotky", () => {
    const obrys: Vzorka = { rohy: obdlznik(100, 200, 300, 600), sirka: 540, vyska: 960 };
    const r = vyberRohyFotky(
      [
        () => null,
        () => {
          throw new Error("plátno");
        },
      ],
      obrys,
      SIRKA,
      VYSKA,
    );
    expect(r).toEqual(obdlznik(200, 400, 600, 1200));
  });

  it("nič a ani obrys — null (celý záber)", () => {
    expect(vyberRohyFotky([() => null], null, SIRKA, VYSKA)).toBeNull();
  });
});
