/*
  Vyrovnanie odfoteného dokladu.

  Doklad na fotke býva šikmo a v perspektíve — bližší okraj je dlhší než
  vzdialenejší. Zo štyroch rohov, ktoré našla detekcia (alebo ich človek
  dotiahol prstom), sa spočíta homografia: zobrazenie, ktoré pravouhlý
  výstup posadí presne na tie štyri body vo fotke. Každý pixel výstupu sa
  potom pozrie do fotky, kam mu homografia ukáže, a vezme farbu odtiaľ
  (bilineárne medzi štyrmi susedmi, inak by písmo zubaté).

  Čisté výpočty bez prehliadača — plátno, video ani `ImageData` tu nie sú,
  aby sa to dalo overiť v testoch. Obrázok je len `{ data, width, height }`
  s RGBA bajtmi, čo `ImageData` aj tak je.
*/

export type Bod = { x: number; y: number };
/** Rohy dokladu v poradí ľavý horný, pravý horný, pravý dolný, ľavý dolný. */
export type Rohy = [Bod, Bod, Bod, Bod];
export type Obraz = { data: Uint8ClampedArray; width: number; height: number };
/** Homografia 3×3 po riadkoch; posledný prvok je vždy 1. */
export type Homografia = number[];

/** Najdlhšia strana vyrovnaného dokladu. A4 pri nej vychádza zhruba na 200 DPI. */
export const MAX_STRANA_VYSTUPU = 2400;

/**
 * Homografia, ktorá zobrazí body `z` na body `na` (každých po štyroch).
 * Vráti `null`, keď sa sústava nedá vyriešiť (tri body na priamke).
 */
export function homografia(z: Rohy, na: Rohy): Homografia | null {
  // Osem neznámych h0…h7, dve rovnice za každý pár bodov.
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = z[i];
    const { x: u, y: v } = na[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u]);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v, v]);
  }
  // Gaussova eliminácia s výberom hlavného prvku.
  for (let s = 0; s < 8; s++) {
    let max = s;
    for (let r = s + 1; r < 8; r++) if (Math.abs(A[r][s]) > Math.abs(A[max][s])) max = r;
    if (Math.abs(A[max][s]) < 1e-12) return null;
    [A[s], A[max]] = [A[max], A[s]];
    for (let r = 0; r < 8; r++) {
      if (r === s) continue;
      const k = A[r][s] / A[s][s];
      if (!k) continue;
      for (let c = s; c < 9; c++) A[r][c] -= k * A[s][c];
    }
  }
  const h = A.map((riadok, i) => riadok[8] / riadok[i]);
  return [...h, 1];
}

/** Kam homografia zobrazí bod. */
export function zobraz(h: Homografia, b: Bod): Bod {
  const w = h[6] * b.x + h[7] * b.y + h[8];
  return {
    x: (h[0] * b.x + h[1] * b.y + h[2]) / w,
    y: (h[3] * b.x + h[4] * b.y + h[5]) / w,
  };
}

const dlzka = (a: Bod, b: Bod) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Ohnisková vzdialenosť kamery ako násobok dlhšej strany obrazu, keď sa
 * nedá zistiť zo štvoruholníka. Hlavná kamera telefónu má zorný uhol okolo
 * 65–75°, čo dáva 0,7–0,85.
 */
export const OHNISKOVA_PREDVOLENA = 0.8;
/** Rozumný rozsah ohniskovej (širokouhlý … dvojnásobný zoom). */
const OHNISKOVA_MIN = 0.35;
const OHNISKOVA_MAX = 4;

type V3 = [number, number, number];
const krizV = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const skalar = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Skutočný pomer šírka / výška dokladu na fotke.
 *
 * Priemer protiľahlých strán to len odhadne: keď je telefón naklonený,
 * obe bočné strany sú skrátené rovnako a dlhý bloček by vyšiel zavalitý.
 * Presnejšie to dá geometria kamery (Zhang, „Whiteboard scanning", 2002):
 * z rohov sa spočíta ohnisková vzdialenosť a z nej skutočné dĺžky strán.
 * Keď sa ohnisková nedá zistiť (len jeden úbežník) alebo vyjde nezmyselne,
 * použije sa typická ohnisková telefónu. Keď by výsledok od priemeru
 * strán ušiel priveľmi, ostane priemer — radšej mierne nepresný než
 * zdeformovaný doklad.
 *
 * `sirka` a `vyska` sú rozmery celého obrazu (stred obrazu = os kamery).
 */
export function pomerStran(rohy: Rohy, sirka: number, vyska: number): number {
  const [lh, ph, pd, ld] = rohy;
  const priemer =
    (dlzka(lh, ph) + dlzka(ld, pd)) / Math.max(1e-9, dlzka(lh, ld) + dlzka(ph, pd)) || 1;
  const s = Math.max(sirka, vyska, 1);
  const m = (b: Bod): V3 => [(b.x - sirka / 2) / s, (b.y - vyska / 2) / s, 1];
  const m1 = m(lh);
  const m2 = m(ph);
  const m3 = m(ld);
  const m4 = m(pd);
  const k2 = skalar(krizV(m1, m4), m3) / skalar(krizV(m2, m4), m3);
  const k3 = skalar(krizV(m1, m4), m2) / skalar(krizV(m3, m4), m2);
  if (!Number.isFinite(k2) || !Number.isFinite(k3)) return priemer;
  const n2 = m2.map((v, i) => k2 * v - m1[i]) as V3;
  const n3 = m3.map((v, i) => k3 * v - m1[i]) as V3;
  let f2 = OHNISKOVA_PREDVOLENA ** 2;
  const men = n2[2] * n3[2];
  if (Math.abs(men) > 1e-6) {
    const odhad = -(n2[0] * n3[0] + n2[1] * n3[1]) / men;
    if (odhad >= OHNISKOVA_MIN ** 2 && odhad <= OHNISKOVA_MAX ** 2) f2 = odhad;
  }
  const d = (n: V3) => (n[0] * n[0] + n[1] * n[1]) / f2 + n[2] * n[2];
  const pomer = Math.sqrt(d(n2) / d(n3));
  if (!Number.isFinite(pomer) || pomer <= 0) return priemer;
  if (pomer / priemer > 1.8 || priemer / pomer > 1.8) return priemer;
  return pomer;
}

/**
 * Rozmer vyrovnaného dokladu. Dlhšia strana je najdlhšia zo strán
 * štvoruholníka (kratšie sú skrátené perspektívou, nie skutočnosťou), druhá
 * sa dopočíta zo skutočného pomeru strán (`pomerStran`). Bez rozmeru
 * zdroja sa pomer berie z priemeru protiľahlých strán. Väčšie než `max`
 * sa to nespraví, menšie áno (nezväčšujeme to, čo kamera nezachytila).
 */
export function rozmerVystupu(
  rohy: Rohy,
  max = MAX_STRANA_VYSTUPU,
  zdroj?: { sirka: number; vyska: number },
): { sirka: number; vyska: number } {
  const [lh, ph, pd, ld] = rohy;
  const dlhsia = Math.max(dlzka(lh, ph), dlzka(ld, pd), dlzka(lh, ld), dlzka(ph, pd), 1);
  const pomer = zdroj
    ? pomerStran(rohy, zdroj.sirka, zdroj.vyska)
    : (dlzka(lh, ph) + dlzka(ld, pd)) / Math.max(1e-9, dlzka(lh, ld) + dlzka(ph, pd)) || 1;
  const sirka = pomer >= 1 ? dlhsia : dlhsia * pomer;
  const vyska = pomer >= 1 ? dlhsia / pomer : dlhsia;
  const k = Math.min(1, max / Math.max(sirka, vyska, 1));
  return {
    sirka: Math.max(1, Math.round(sirka * k)),
    vyska: Math.max(1, Math.round(vyska * k)),
  };
}

/**
 * Rohy zoradené tak, ako ich čaká `vyrovnaj` (ľavý horný, pravý horný,
 * pravý dolný, ľavý dolný). Keď človek potiahne roh cez iný, štvoruholník
 * by sa prekrížil a výstup by bol prevrátený nezmysel.
 */
export function usporiadajRohy(rohy: Rohy): Rohy {
  // Neprekrížený štvoruholník ostáva, ako je (aj otočený doklad).
  let znamienko = 0;
  let konvexny = true;
  for (let i = 0; i < 4; i++) {
    const a = rohy[i];
    const b = rohy[(i + 1) % 4];
    const c = rohy[(i + 2) % 4];
    const z = Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
    if (!z || (znamienko && z !== znamienko)) konvexny = false;
    znamienko = z || znamienko;
  }
  // Kladné znamienko = v smere hodinových ručičiek (y ide nadol), nie zrkadlovo.
  if (konvexny && znamienko > 0) return rohy;
  const sx = (rohy[0].x + rohy[1].x + rohy[2].x + rohy[3].x) / 4;
  const sy = (rohy[0].y + rohy[1].y + rohy[2].y + rohy[3].y) / 4;
  // Podľa uhla okolo stredu v smere hodinových ručičiek (y ide nadol).
  const podlaUhla = [...rohy].sort(
    (a, b) => Math.atan2(a.y - sy, a.x - sx) - Math.atan2(b.y - sy, b.x - sx),
  );
  // Začne sa rohom najbližšie k ľavému hornému (najmenší súčet x + y).
  let start = 0;
  for (let i = 1; i < 4; i++)
    if (podlaUhla[i].x + podlaUhla[i].y < podlaUhla[start].x + podlaUhla[start].y) start = i;
  return [0, 1, 2, 3].map((i) => podlaUhla[(start + i) % 4]) as Rohy;
}

/**
 * Vyrovná riadky `[od, do)` výstupu. Rozdelené na kúsky preto, aby veľký
 * doklad (2400 × 3400) mohol ísť po častiach a obrazovka medzi nimi dýchala.
 *
 * `h` zobrazuje súradnice výstupu na súradnice zdroja.
 */
export function vyrovnajRiadky(
  zdroj: Obraz,
  h: Homografia,
  vystup: Obraz,
  od: number,
  po: number,
): void {
  const { data: s, width: sw, height: sh } = zdroj;
  const { data: d, width: dw } = vystup;
  const maxX = sw - 1;
  const maxY = sh - 1;
  for (let y = od; y < po; y++) {
    const cy = y + 0.5;
    // Po riadku sa menia čitateľ aj menovateľ lineárne — stačí ich posúvať.
    let nx = h[0] * 0.5 + h[1] * cy + h[2];
    let ny = h[3] * 0.5 + h[4] * cy + h[5];
    let nw = h[6] * 0.5 + h[7] * cy + h[8];
    let o = y * dw * 4;
    for (let x = 0; x < dw; x++) {
      let fx = nx / nw - 0.5;
      let fy = ny / nw - 0.5;
      if (fx < 0) fx = 0;
      else if (fx > maxX) fx = maxX;
      if (fy < 0) fy = 0;
      else if (fy > maxY) fy = maxY;
      const x0 = fx | 0;
      const y0 = fy | 0;
      const x1 = x0 < maxX ? x0 + 1 : x0;
      const y1 = y0 < maxY ? y0 + 1 : y0;
      const ax = fx - x0;
      const ay = fy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const hore = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * ax;
        const dole = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * ax;
        d[o + c] = hore + (dole - hore) * ay;
      }
      d[o + 3] = 255;
      o += 4;
      nx += h[0];
      ny += h[3];
      nw += h[6];
    }
  }
}

/**
 * Celé vyrovnanie: zo štyroch rohov vo `zdroj` urobí pravouhlý obraz.
 * `prestavka` sa zavolá medzi kúskami (v appke krátke `setTimeout`), aby
 * telefón medzitým prekreslil „Upravujem…".
 */
export async function vyrovnaj(
  zdroj: Obraz,
  rohy: Rohy,
  moznosti: {
    max?: number;
    vytvor?: (sirka: number, vyska: number) => Obraz;
    prestavka?: () => Promise<void>;
    riadkovNaraz?: number;
  } = {},
): Promise<Obraz> {
  const { sirka, vyska } = rozmerVystupu(rohy, moznosti.max, {
    sirka: zdroj.width,
    vyska: zdroj.height,
  });
  const vystup = moznosti.vytvor
    ? moznosti.vytvor(sirka, vyska)
    : { data: new Uint8ClampedArray(sirka * vyska * 4), width: sirka, height: vyska };
  const ciel: Rohy = [
    { x: 0, y: 0 },
    { x: sirka, y: 0 },
    { x: sirka, y: vyska },
    { x: 0, y: vyska },
  ];
  const h = homografia(ciel, rohy);
  if (!h) throw new Error("Rohy dokladu ležia na jednej priamke");
  const naraz = moznosti.riadkovNaraz ?? 160;
  for (let y = 0; y < vyska; y += naraz) {
    vyrovnajRiadky(zdroj, h, vystup, y, Math.min(vyska, y + naraz));
    if (moznosti.prestavka && y + naraz < vyska) await moznosti.prestavka();
  }
  return vystup;
}

/** Otočí rohy spolu s obrázkom o 90° v smere hodinových ručičiek. */
export function otocRohy(rohy: Rohy, vyskaPred: number): Rohy {
  // Bod (x, y) v obrázku W×H je po otočení v H×W na (H − y, x).
  const o = (b: Bod): Bod => ({ x: vyskaPred - b.y, y: b.x });
  const [lh, ph, pd, ld] = rohy;
  // Bývalý ľavý dolný je teraz vľavo hore.
  return [o(ld), o(lh), o(ph), o(pd)];
}

/** Rohy celého obrázka s malým okrajom — keď detekcia nič nenašla. */
export function predvoleneRohy(sirka: number, vyska: number, okraj = 0.04): Rohy {
  const dx = sirka * okraj;
  const dy = vyska * okraj;
  return [
    { x: dx, y: dy },
    { x: sirka - dx, y: dy },
    { x: sirka - dx, y: vyska - dy },
    { x: dx, y: vyska - dy },
  ];
}

export type Filter = "povodny" | "vylepseny" | "ciernobiely";

/**
 * Jas a kontrast filtra. Posuvníky (−50 … 50) sa pripočítajú k tomu, čo
 * filter robí sám. Tie isté čísla používa náhľad cez CSS, aby uložený
 * doklad vyzeral tak, ako ho človek videl.
 */
export function nastavenieFiltra(filter: Filter, jas = 0, kontrast = 0) {
  const zaklad =
    filter === "vylepseny"
      ? { jas: 14, kontrast: 1.3 }
      : filter === "ciernobiely"
        ? { jas: 22, kontrast: 1.6 }
        : { jas: 0, kontrast: 1 };
  return {
    sivy: filter === "ciernobiely",
    jas: zaklad.jas + jas,
    kontrast: Math.max(0.2, zaklad.kontrast * (1 + kontrast / 100)),
  };
}

/** Rovnaký filter ako CSS pre náhľad (jas sa tu prepočíta na násobok). */
export function cssFiltra(filter: Filter, jas = 0, kontrast = 0): string {
  const n = nastavenieFiltra(filter, jas, kontrast);
  if (!n.sivy && n.jas === 0 && n.kontrast === 1) return "none";
  return `${n.sivy ? "grayscale(1) " : ""}contrast(${n.kontrast.toFixed(2)}) brightness(${(1 + n.jas / 200).toFixed(3)})`;
}

/** Použije filter priamo na bajty obrázka (na mieste). */
export function pouziFilter(obr: Obraz, filter: Filter, jas = 0, kontrast = 0): void {
  const n = nastavenieFiltra(filter, jas, kontrast);
  if (!n.sivy && n.jas === 0 && n.kontrast === 1) return;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = (v - 128) * n.kontrast + 128 + n.jas;
  const d = obr.data;
  for (let i = 0; i < d.length; i += 4) {
    if (n.sivy) {
      const g = lut[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8];
      d[i] = d[i + 1] = d[i + 2] = g;
    } else {
      d[i] = lut[d[i]];
      d[i + 1] = lut[d[i + 1]];
      d[i + 2] = lut[d[i + 2]];
    }
  }
}
