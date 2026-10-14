/*
  Kde je na obraze doklad.

  Doklad je takmer vždy svetlý papier na tmavšom podklade (stôl, dlaň,
  palubná doska). Stačí preto obyčajná cesta bez OpenCV:

    1. odtiene sivej a jemné rozmazanie (písmo na papieri nesmie robiť diery),
    2. prah podľa Otsua — rozdelí obraz na svetlé a tmavé tak, aby boli obe
       skupiny čo najviac odlišné,
    3. najväčšia súvislá svetlá oblasť je doklad,
    4. jej konvexný obal sa zjednoduší na štvoruholník: dva najvzdialenejšie
       body sú protiľahlé rohy, zvyšné dva sú body najďalej od ich spojnice
       na každej strane.

  Keď výsledok nedáva zmysel (malá plocha, oblasť nie je štvoruholník, celý
  obraz je svetlý), vráti sa `null` — lepšie žiadny obrys než obrys okolo
  lampy. Pracuje sa na zmenšenom obraze (~320 px), takže to trvá pár
  milisekúnd aj na starom telefóne.
*/

import type { Bod, Obraz, Rohy } from "./perspektiva";

/** Doklad musí zaberať aspoň takúto časť obrazu, inak to nie je doklad. */
export const MIN_PLOCHA = 0.15;
/** Na akú dlhšiu stranu sa obraz zmenší pred hľadaním okrajov. */
export const STRANA_DETEKCIE = 320;

/** Odtiene sivej s rozmazaním 5×5 (dva prechody kĺzavým súčtom). */
function siveRozmazane(obr: Obraz): Uint8Array {
  const { data, width: w, height: h } = obr;
  const sive = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < sive.length; i += 4, j++)
    sive[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  const r = 2;
  const pom = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w) {
          s += sive[o + xx];
          n++;
        }
      }
      pom[o + x] = s / n;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h) {
          s += pom[yy * w + x];
          n++;
        }
      }
      sive[y * w + x] = s / n;
    }
  }
  return sive;
}

/** Otsuov prah. Vráti aj to, ako veľmi sa svetlé od tmavého líši. */
export function otsu(sive: Uint8Array): { prah: number; rozdiel: number } {
  const hist = new Float64Array(256);
  for (let i = 0; i < sive.length; i++) hist[sive[i]]++;
  const n = sive.length;
  let sucet = 0;
  for (let v = 0; v < 256; v++) sucet += v * hist[v];
  let wB = 0;
  let sB = 0;
  let najlepsi = -1;
  let prah = 0;
  let rozdiel = 0;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sB += v * hist[v];
    const mB = sB / wB;
    const mF = (sucet - sB) / wF;
    const medzi = wB * wF * (mB - mF) * (mB - mF);
    if (medzi > najlepsi) {
      najlepsi = medzi;
      prah = v;
      rozdiel = mF - mB;
    }
  }
  return { prah, rozdiel };
}

const kriz = (o: Bod, a: Bod, b: Bod) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Konvexný obal (Andrewov monotónny reťazec). */
export function konvexnyObal(body: Bod[]): Bod[] {
  const p = [...body].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const dole: Bod[] = [];
  for (const b of p) {
    while (dole.length >= 2 && kriz(dole[dole.length - 2], dole[dole.length - 1], b) <= 0)
      dole.pop();
    dole.push(b);
  }
  const hore: Bod[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const b = p[i];
    while (hore.length >= 2 && kriz(hore[hore.length - 2], hore[hore.length - 1], b) <= 0)
      hore.pop();
    hore.push(b);
  }
  return [...dole.slice(0, -1), ...hore.slice(0, -1)];
}

/** Plocha mnohouholníka (bez znamienka). */
export function plocha(body: Bod[]): number {
  let s = 0;
  for (let i = 0; i < body.length; i++) {
    const a = body[i];
    const b = body[(i + 1) % body.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Zoradí štyri body na ľavý horný, pravý horný, pravý dolný, ľavý dolný. */
export function zoradRohy(body: Bod[]): Rohy {
  const cx = body.reduce((s, b) => s + b.x, 0) / body.length;
  const cy = body.reduce((s, b) => s + b.y, 0) / body.length;
  // Na obrazovke ide os y dole, takže rastúci uhol je v smere hodinových ručičiek.
  const p = [...body].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  let prvy = 0;
  for (let i = 1; i < 4; i++) if (p[i].x + p[i].y < p[prvy].x + p[prvy].y) prvy = i;
  return [0, 1, 2, 3].map((i) => p[(prvy + i) % 4]) as Rohy;
}

/** Konvexný obal zjednodušený na štyri rohy. */
export function stvoruholnik(obal: Bod[]): Rohy | null {
  if (obal.length < 4) return null;
  let a = 0;
  let c = 1;
  let max = -1;
  for (let i = 0; i < obal.length; i++)
    for (let j = i + 1; j < obal.length; j++) {
      const d = (obal[i].x - obal[j].x) ** 2 + (obal[i].y - obal[j].y) ** 2;
      if (d > max) {
        max = d;
        a = i;
        c = j;
      }
    }
  let b = -1;
  let d = -1;
  let maxB = 0;
  let maxD = 0;
  for (let i = 0; i < obal.length; i++) {
    const k = kriz(obal[a], obal[c], obal[i]);
    if (k > maxB) {
      maxB = k;
      b = i;
    } else if (-k > maxD) {
      maxD = -k;
      d = i;
    }
  }
  if (b < 0 || d < 0) return null;
  return zoradRohy([obal[a], obal[b], obal[c], obal[d]]);
}

/** Sú rohy rozumný doklad? Konvexný, nie príliš zdeformovaný štvoruholník. */
export function rozumneRohy(rohy: Rohy, sirka: number, vyska: number): boolean {
  if (plocha(rohy) < MIN_PLOCHA * sirka * vyska) return false;
  const kratsia = Math.min(sirka, vyska);
  let znamienko = 0;
  for (let i = 0; i < 4; i++) {
    const p = rohy[(i + 3) % 4];
    const o = rohy[i];
    const n = rohy[(i + 1) % 4];
    if (Math.hypot(n.x - o.x, n.y - o.y) < 0.1 * kratsia) return false;
    const k = kriz(o, n, p);
    const z = Math.sign(k);
    if (!z || (znamienko && z !== znamienko)) return false;
    znamienko = z;
    // Uhol v rohu — doklad v perspektíve má rohy zhruba medzi 35° a 145°.
    const u1 = Math.atan2(p.y - o.y, p.x - o.x);
    const u2 = Math.atan2(n.y - o.y, n.x - o.x);
    let uhol = Math.abs(u1 - u2) * (180 / Math.PI);
    if (uhol > 180) uhol = 360 - uhol;
    if (uhol < 35 || uhol > 145) return false;
  }
  return true;
}

/**
 * Nájde doklad na obraze. Rohy sú v pixeloch daného obrazu; `null`, keď na
 * ňom nič rozumné nie je.
 */
export function najdiOkraje(obr: Obraz): Rohy | null {
  const { width: w, height: h } = obr;
  if (w < 16 || h < 16) return null;
  const sive = siveRozmazane(obr);
  const { prah, rozdiel } = otsu(sive);
  // Bez kontrastu (prázdny stôl, tma, celá plocha papier) niet čo hľadať.
  if (rozdiel < 30) return null;

  // Najväčšia súvislá svetlá oblasť (štvorsusednosť).
  const znacka = new Int32Array(w * h);
  const zasobnik = new Int32Array(w * h);
  let najvacsia = 0;
  let najPlocha = 0;
  let dalsia = 1;
  for (let start = 0; start < w * h; start++) {
    if (znacka[start] || sive[start] <= prah) continue;
    const id = dalsia++;
    let vrch = 0;
    let pocet = 0;
    zasobnik[vrch++] = start;
    znacka[start] = id;
    while (vrch) {
      const i = zasobnik[--vrch];
      pocet++;
      const x = i % w;
      if (x > 0 && !znacka[i - 1] && sive[i - 1] > prah)
        ((znacka[i - 1] = id), (zasobnik[vrch++] = i - 1));
      if (x < w - 1 && !znacka[i + 1] && sive[i + 1] > prah)
        ((znacka[i + 1] = id), (zasobnik[vrch++] = i + 1));
      if (i >= w && !znacka[i - w] && sive[i - w] > prah)
        ((znacka[i - w] = id), (zasobnik[vrch++] = i - w));
      if (i < w * (h - 1) && !znacka[i + w] && sive[i + w] > prah)
        ((znacka[i + w] = id), (zasobnik[vrch++] = i + w));
    }
    if (pocet > najPlocha) {
      najPlocha = pocet;
      najvacsia = id;
    }
  }
  if (!najvacsia || najPlocha < MIN_PLOCHA * w * h || najPlocha > 0.97 * w * h) return null;

  // Okraj oblasti: v každom riadku jej krajný ľavý a pravý pixel.
  const body: Bod[] = [];
  for (let y = 0; y < h; y++) {
    let l = -1;
    let p = -1;
    const o = y * w;
    for (let x = 0; x < w; x++)
      if (znacka[o + x] === najvacsia) {
        if (l < 0) l = x;
        p = x;
      }
    if (l >= 0) body.push({ x: l, y }, { x: p + 1, y }, { x: l, y: y + 1 }, { x: p + 1, y: y + 1 });
  }
  const rohy = stvoruholnik(konvexnyObal(body));
  if (!rohy || !rozumneRohy(rohy, w, h)) return null;
  // Oblasť musí štvoruholník naozaj vypĺňať — kruh či fľak by mal plochu inú.
  const pomer = najPlocha / plocha(rohy);
  if (pomer < 0.85 || pomer > 1.15) return null;
  return rohy;
}

/** Rohy z menšieho obrazu prepočítané na väčší. */
export function zvacsiRohy(rohy: Rohy, k: number): Rohy {
  return rohy.map((b) => ({ x: b.x * k, y: b.y * k })) as Rohy;
}
