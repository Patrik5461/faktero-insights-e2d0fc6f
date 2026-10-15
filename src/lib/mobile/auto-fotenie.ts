/**
 * Automatické odfotenie dokladu — keď je doklad v zábere a ruka sa ustálila.
 *
 * Obrys dokladu sa hľadá raz za ~300 ms. Fotí sa, keď posledné vzorky ležia
 * na tom istom mieste (rohy sa pohli najviac o malý kúsok uhlopriečky) a
 * doklad zaberá rozumnú časť obrazu. Pri rozmazanom zábere sa obrys hýbe,
 * takže čakanie na ustálenie zároveň znamená ostrejšiu fotku.
 */
import type { Rohy } from "./perspektiva";

export type Vzorka = { rohy: Rohy; sirka: number; vyska: number };

/** Koľko po sebe idúcich ustálených vzoriek treba (~1,2 s pri 300 ms). */
export const POTREBNYCH_VZORIEK = 4;
/** Najväčší posun rohu medzi vzorkami ako podiel uhlopriečky obrazu. */
export const TOLERANCIA_POSUNU = 0.02;
/** Doklad musí zaberať aspoň takúto časť obrazu, inak je ďaleko. */
export const MIN_PLOCHA = 0.18;

function plocha(r: Rohy): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = r[i]!;
    const b = r[(i + 1) % 4]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Pohli sa rohy medzi dvoma vzorkami najviac o toleranciu? */
function rovnakeMiesto(a: Vzorka, b: Vzorka): boolean {
  if (a.sirka !== b.sirka || a.vyska !== b.vyska) return false;
  const uhlopriecka = Math.hypot(a.sirka, a.vyska);
  return a.rohy.every(
    (p, i) => Math.hypot(p.x - b.rohy[i]!.x, p.y - b.rohy[i]!.y) <= TOLERANCIA_POSUNU * uhlopriecka,
  );
}

/**
 * Koľko posledných vzoriek je ustálených (0 … POTREBNYCH_VZORIEK). `null`
 * vo vzorkách = doklad v tom okamihu nebol nájdený, počíta sa od nuly.
 */
export function ustalenych(vzorky: (Vzorka | null)[]): number {
  let n = 0;
  for (let i = vzorky.length - 1; i >= 0; i--) {
    const v = vzorky[i];
    if (!v) break;
    if (plocha(v.rohy) < MIN_PLOCHA * v.sirka * v.vyska) break;
    const dalsia = vzorky[i + 1];
    if (dalsia && !rovnakeMiesto(v, dalsia)) break;
    n++;
    if (n >= POTREBNYCH_VZORIEK) break;
  }
  return n;
}

export const maFotit = (vzorky: (Vzorka | null)[]) => ustalenych(vzorky) >= POTREBNYCH_VZORIEK;
