/*
  Orez dokladu — čo sa deje s rohmi medzi detekciou a „Upraviť doklad".

  - `dalsiObrys`: živý obrys počas mierenia. Detekcia na zmenšenom rámci
    skáče o pár pixelov aj pri nehybnej ruke, takže sa rohy berú ako medián
    z posledných snímok a drobný posun sa vôbec neprejaví (hysterézia). Keď
    sa doklad naozaj pohne (veľký skok), obrys preskočí hneď, bez dobiehania.
  - `vyberRohyFotky`: po odfotení sa doklad hľadá znova na ostrej fotke;
    posledný živý obrys je len záloha, keď fotka nič nedá.

  Čisté výpočty bez prehliadača, aby sa dali overiť v testoch.
*/
import type { Rohy } from "./perspektiva";

export type Vzorka = { rohy: Rohy; sirka: number; vyska: number };

/** Z koľkých posledných detekcií sa počíta medián. */
export const HISTORIA_OBRYSU = 4;
/** Posun pod touto časťou uhlopriečky sa na obryse neprejaví. */
export const MALY_POSUN = 0.012;
/** Posun nad touto časťou uhlopriečky je nový doklad / nová poloha — skočí sa hneď. */
export const VELKY_SKOK = 0.1;
/** Po koľkých prázdnych rámcoch za sebou obrys zhasne. */
export const ZHASNI_PO = 2;

export type StavObrysu = {
  /** Čo sa práve kreslí; `null` = žiadny obrys. */
  zobrazene: Vzorka | null;
  historia: Rohy[];
  prazdnych: number;
};

export const PRAZDNY_OBRYS: StavObrysu = { zobrazene: null, historia: [], prazdnych: 0 };

const uhlopriecka = (sirka: number, vyska: number) => Math.hypot(sirka, vyska) || 1;

/** Najväčší posun rohu medzi dvoma štvoricami rohov (v pixeloch). */
export function najvacsiPosun(a: Rohy, b: Rohy): number {
  let max = 0;
  for (let i = 0; i < 4; i++) max = Math.max(max, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y));
  return max;
}

const median = (h: number[]) => {
  const s = [...h].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Medián každej súradnice každého rohu — jeden ujdený rámec priemer nepotiahne. */
export function medianRohov(historia: Rohy[]): Rohy {
  return [0, 1, 2, 3].map((i) => ({
    x: median(historia.map((r) => r[i].x)),
    y: median(historia.map((r) => r[i].y)),
  })) as Rohy;
}

/**
 * Ďalší stav živého obrysu po jednom rámci. `nove` je to, čo našla
 * detekcia (`null` = nič). Vracia vždy nový objekt, aj keď sa obrys
 * nepohol — automatické odfotenie počíta ustálené rámce po jednom.
 */
export function dalsiObrys(stav: StavObrysu, nove: Vzorka | null): StavObrysu {
  if (!nove) {
    const prazdnych = stav.prazdnych + 1;
    // Jeden prázdny rámec (trasenie, odlesk) obrys ešte nezhasne.
    if (prazdnych >= ZHASNI_PO) return { zobrazene: null, historia: [], prazdnych };
    return { ...stav, prazdnych };
  }
  const z = stav.zobrazene;
  if (!z || z.sirka !== nove.sirka || z.vyska !== nove.vyska) {
    return { zobrazene: nove, historia: [nove.rohy], prazdnych: 0 };
  }
  const diag = uhlopriecka(nove.sirka, nove.vyska);
  if (najvacsiPosun(nove.rohy, z.rohy) > VELKY_SKOK * diag) {
    // Doklad sa naozaj pohol — stará história by obrys len brzdila.
    return { zobrazene: nove, historia: [nove.rohy], prazdnych: 0 };
  }
  const historia = [...stav.historia.slice(-(HISTORIA_OBRYSU - 1)), nove.rohy];
  const kandidat = medianRohov(historia);
  const rohy = najvacsiPosun(kandidat, z.rohy) < MALY_POSUN * diag ? z.rohy : kandidat;
  return { zobrazene: { ...z, rohy }, historia, prazdnych: 0 };
}

/** Rohy prepočítané na obraz iného rozmeru (napr. z videa na fotku). */
export function prepocitajRohy(v: Vzorka, sirka: number, vyska: number): Rohy {
  const kx = sirka / (v.sirka || 1);
  const ky = vyska / (v.vyska || 1);
  return v.rohy.map((b) => ({ x: b.x * kx, y: b.y * ky })) as Rohy;
}

/**
 * Rohy pre odfotenú snímku. `hladaj` sú pokusy o detekciu na fotke od
 * najostrejšieho (volajú sa až keď treba). Vyhráva prvý, ktorý sedí so
 * živým obrysom — ten človek videl a mieril podľa neho. Keď nesedí žiadny,
 * vyhráva fotka (ruka sa pri spúšti pohla). Keď fotka nedá nič, ostáva
 * živý obrys, a keď nie je ani ten, `null` (celý záber).
 */
export function vyberRohyFotky(
  hladaj: (() => Rohy | null)[],
  obrys: Vzorka | null,
  sirka: number,
  vyska: number,
): Rohy | null {
  const zaloha = obrys ? prepocitajRohy(obrys, sirka, vyska) : null;
  const diag = uhlopriecka(sirka, vyska);
  let prvy: Rohy | null = null;
  for (const h of hladaj) {
    let r: Rohy | null = null;
    try {
      r = h();
    } catch {
      r = null;
    }
    if (!r) continue;
    if (!zaloha || najvacsiPosun(r, zaloha) <= VELKY_SKOK * diag) return r;
    prvy ??= r;
  }
  return prvy ?? zaloha;
}

/** Sú dve štvorice rohov prakticky tie isté? (napr. „je to celý obraz?") */
export function rovnakeRohy(a: Rohy, b: Rohy, tolerancia = 1): boolean {
  return najvacsiPosun(a, b) <= tolerancia;
}
