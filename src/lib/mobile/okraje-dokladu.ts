/*
  Kde je na obraze doklad.

  Doklad je takmer vždy svetlý papier na tmavšom podklade (stôl, dlaň,
  palubná doska). Jeden prah na celý obraz ale nestačí: odlesk na stole,
  svetlý kus pozadia alebo ruka sa k bločku prilepia a obrys potom
  „uletí“ do rohu; tieň cez polovicu bločku ho zas rozdelí. Preto sa skúša
  viac kandidátov a vyhrá ten, ktorý najviac vyzerá ako doklad:

    1. jas bez farby — hlavne najslabší farebný kanál, takže oranžové
       drevo stmavne a biely či sivastý termopapier ostane svetlý,
       s jemným rozmazaním (písmo na papieri nesmie robiť diery),
    2. tri masky: Otsuov prah, prísnejší prah (odreže odlesk, ktorý je
       o kúsok tmavší než papier) a miestny kontrast — pixel svetlejší než
       jeho okolie, čo prežije tieň aj prechod svetla,
    3. v každej maske tri najväčšie súvislé svetlé oblasti,
    4. konvexný obal oblasti, v ňom štvoruholník s najväčšou plochou a jeho
       strany dorovnané na okraj oblasti (pokrčený papier nereže dnu),
    5. skóre: na každej strane štvoruholníka musí byť vnútri svetlejšie než
       vonku (hrana dokladu naozaj je tam, kde ju kreslíme) a oblasť musí
       štvoruholník vypĺňať. Strana na okraji záberu sa ráta za pol —
       bloček môže zo záberu trčať, ale celý záber ešte nie je doklad.

  Víťaz sa ešte o kúsok rozšíri, aby text pri okraji pri orezaní neutiekol.
  Keď nič nedáva zmysel, vráti sa `null` — lepšie žiadny obrys než obrys
  okolo lampy. Pracuje sa na zmenšenom obraze (~320 px), takže to trvá pár
  milisekúnd aj na starom telefóne.
*/

import type { Bod, Obraz, Rohy } from "./perspektiva";

/** Doklad musí zaberať aspoň takúto časť obrazu (úzky bloček býva aj pod 10 %). */
export const MIN_PLOCHA = 0.04;
/** Na akú dlhšiu stranu sa obraz zmenší pred hľadaním okrajov. */
export const STRANA_DETEKCIE = 320;
/** Pod takúto istotou sa obrys radšej neukáže (nastavené na skutočných fotkách bločkov). */
export const MIN_ISTOTA = 0.76;
/** O koľko sa nájdený obrys rozšíri, ako časť dlhšej strany obrazu. */
export const OKRAJ_NAVYSE = 0.012;

/** Nájdený doklad aj s tým, ako veľmi sme si istí (0–1). */
export type NajdenyDoklad = {
  rohy: Rohy;
  istota: number;
  /** Ktorý kandidát vyhral — len na ladenie. */
  zdroj: string;
};

/**
 * Jas bez farby s rozmazaním 5×5 (dva prechody kĺzavým súčtom).
 * Biely aj sivastý papier má všetky kanály podobné, drevo, koberec či koža
 * majú jeden kanál slabý — preto hlavne najslabší kanál a štvrtina jasu
 * (tá tlmí šum jedného kanála). Papier pod modrastým či teplým svetlom
 * ostane svetlejší než oranžový stôl.
 */
function siveRozmazane(obr: Obraz): Uint8Array {
  const { data, width: w, height: h } = obr;
  const n = w * h;
  const sive = new Uint8Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const jas = (r * 77 + g * 150 + b * 29) >> 8;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    sive[j] = (jas + 3 * min) >> 2;
  }
  return rozmaz(sive, w, h, 2);
}

/** Priemer v štvorci (2r+1)² — kĺzavý súčet po riadkoch, potom po stĺpcoch naraz. */
function rozmaz(sive: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const pom = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let s = 0;
    for (let k = 0; k <= r && k < w; k++) s += sive[o + k];
    for (let x = 0; x < w; x++) {
      pom[o + x] = s;
      if (x - r >= 0) s -= sive[o + x - r];
      if (x + r + 1 < w) s += sive[o + x + r + 1];
    }
  }
  // Koľko pixelov v riadku do súčtu prispelo (pri okraji menej).
  const sirky = new Uint8Array(w);
  for (let x = 0; x < w; x++) sirky[x] = Math.min(w - 1, x + r) - Math.max(0, x - r) + 1;
  const stlpce = new Uint32Array(w);
  for (let y = 0; y <= r && y < h; y++) for (let x = 0; x < w; x++) stlpce[x] += pom[y * w + x];
  const von = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const vyska = Math.min(h - 1, y + r) - Math.max(0, y - r) + 1;
    const o = y * w;
    const hore = (y - r) * w;
    const dole = (y + r + 1) * w;
    for (let x = 0; x < w; x++) {
      von[o + x] = stlpce[x] / (sirky[x] * vyska);
      if (y - r >= 0) stlpce[x] -= pom[hore + x];
      if (y + r + 1 < h) stlpce[x] += pom[dole + x];
    }
  }
  return von;
}

/** Otsuov prah. Vráti aj to, ako veľmi sa svetlé od tmavého líši. */
export function otsu(sive: Uint8Array): { prah: number; rozdiel: number } {
  const hist = new Float64Array(256);
  for (let i = 0; i < sive.length; i++) hist[sive[i]]++;
  return otsuZHistogramu(hist, sive.length);
}

function otsuZHistogramu(hist: Float64Array, n: number): { prah: number; rozdiel: number } {
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

/**
 * Štvoruholník s najväčšou plochou z vrcholov konvexného obalu. Pri pevnom
 * prvom vrchole sa ďalšie dva posúvajú len dopredu (plocha trojuholníka nad
 * konvexným mnohouholníkom má jediné maximum), takže je to O(n²).
 */
export function stvoruholnik(obal: Bod[]): Rohy | null {
  const n = obal.length;
  if (n < 4) return null;
  const v = (i: number) => obal[i % n];
  const troj = (a: number, b: number, c: number) => Math.abs(kriz(v(a), v(b), v(c)));
  let max = 0;
  let naj: number[] | null = null;
  for (let i = 0; i < n; i++) {
    let j = i + 1;
    let l = i + 3;
    for (let k = i + 2; k < i + n - 1; k++) {
      if (j >= k) j = k - 1;
      while (j + 1 < k && troj(i, j + 1, k) >= troj(i, j, k)) j++;
      if (l <= k) l = k + 1;
      while (l + 1 < i + n && troj(i, k, l + 1) >= troj(i, k, l)) l++;
      const s = troj(i, j, k) + troj(i, k, l);
      if (s > max) {
        max = s;
        naj = [i, j, k, l];
      }
    }
  }
  if (!naj) return null;
  return zoradRohy(naj.map((i) => v(i)));
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
    if (Math.hypot(n.x - o.x, n.y - o.y) < 0.06 * kratsia) return false;
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
 * Miestny kontrast: o koľko je pixel svetlejší než priemer okolia (128 =
 * rovnako). Tieň z ruky či prechod svetla stmaví papier aj stôl naraz, takže
 * papier ostane svetlejší než okolie, aj keď ho globálny prah rozdelí.
 */
function miestnyKontrast(sive: Uint8Array, w: number, h: number, r: number): Uint8Array {
  // Integrálny obraz, potom priemer v štvorci za konštantný čas.
  const W = w + 1;
  const int = new Int32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let riadok = 0;
    for (let x = 0; x < w; x++) {
      riadok += sive[y * w + x];
      int[(y + 1) * W + x + 1] = int[y * W + x + 1] + riadok;
    }
  }
  const von = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = y - r < 0 ? 0 : y - r;
    const y1 = y + r + 1 > h ? h : y + r + 1;
    for (let x = 0; x < w; x++) {
      const x0 = x - r < 0 ? 0 : x - r;
      const x1 = x + r + 1 > w ? w : x + r + 1;
      const sucet = int[y1 * W + x1] - int[y0 * W + x1] - int[y1 * W + x0] + int[y0 * W + x0];
      const v = 128 + sive[y * w + x] - sucet / ((y1 - y0) * (x1 - x0));
      von[y * w + x] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return von;
}

/** Súvislá svetlá oblasť: počet pixelov a ohraničujúci obdĺžnik (v obraze s rámikom). */
type Oblast = { id: number; pocet: number; x0: number; x1: number; y0: number; y1: number };

/**
 * Súvislé oblasti nad prahom (štvorsusednosť) v maske s rámikom širokým
 * jeden pixel — rámik je vždy nula, takže netreba strážiť hranice obrazu.
 * Vráti najviac `kolko` najväčších oblastí aspoň s `min` pixelmi.
 */
function oblasti(
  maska: Uint8Array,
  W: number,
  H: number,
  znacka: Int32Array,
  zasobnik: Int32Array,
  min: number,
  max: number,
  kolko: number,
): Oblast[] {
  znacka.fill(0);
  let velke: Oblast[] = [];
  let id = 0;
  const koniec = W * (H - 1);
  for (let start = W; start < koniec; start++) {
    if (znacka[start] || !maska[start]) continue;
    id++;
    let vrch = 0;
    let pocet = 0;
    let posledny = start;
    zasobnik[vrch++] = start;
    znacka[start] = id;
    while (vrch) {
      const i = zasobnik[--vrch];
      pocet++;
      if (i > posledny) posledny = i;
      let j = i - 1;
      if (!znacka[j] && maska[j]) ((znacka[j] = id), (zasobnik[vrch++] = j));
      j = i + 1;
      if (!znacka[j] && maska[j]) ((znacka[j] = id), (zasobnik[vrch++] = j));
      j = i - W;
      if (!znacka[j] && maska[j]) ((znacka[j] = id), (zasobnik[vrch++] = j));
      j = i + W;
      if (!znacka[j] && maska[j]) ((znacka[j] = id), (zasobnik[vrch++] = j));
    }
    if (pocet >= min && pocet <= max)
      velke.push({ id, pocet, x0: 0, x1: 0, y0: (start / W) | 0, y1: (posledny / W) | 0 });
  }
  velke = velke.sort((a, b) => b.pocet - a.pocet).slice(0, kolko);
  // Šírka vybraných oblastí — jeden prechod ich riadkami.
  for (const o of velke) {
    let x0 = W;
    let x1 = 0;
    for (let y = o.y0; y <= o.y1; y++) {
      const riadok = y * W;
      for (let x = 1; x < x0; x++) if (znacka[riadok + x] === o.id) ((x0 = x), (x = W));
      for (let x = W - 2; x > x1; x--) if (znacka[riadok + x] === o.id) ((x1 = x), (x = 0));
    }
    o.x0 = x0;
    o.x1 = x1;
  }
  return velke;
}

/**
 * Okraj oblasti: v každom riadku krajný ľavý a pravý pixel, v každom stĺpci
 * horný a dolný, už v súradniciach obrazu bez rámika. Vráti aj plochu
 * z rozpätí riadkov — diery od písma sa do nej nerátajú ako chýbajúce.
 */
function okrajOblasti(
  znacka: Int32Array,
  W: number,
  o: Oblast,
  w: number,
  h: number,
): { body: Bod[]; rozpatie: number } {
  const body: Bod[] = [];
  const sirka = o.x1 - o.x0 + 1;
  const hore = new Int32Array(sirka).fill(-1);
  const dole = new Int32Array(sirka);
  let rozpatie = 0;
  const pridaj = (x: number, y: number) =>
    body.push({ x: x < 0 ? 0 : x > w ? w : x, y: y < 0 ? 0 : y > h ? h : y });
  for (let y = o.y0; y <= o.y1; y++) {
    let l = -1;
    let p = -1;
    const riadok = y * W;
    for (let x = o.x0; x <= o.x1; x++)
      if (znacka[riadok + x] === o.id) {
        if (l < 0) l = x;
        p = x;
        const k = x - o.x0;
        if (hore[k] < 0) hore[k] = y;
        dole[k] = y;
      }
    if (l >= 0) {
      rozpatie += p - l + 1;
      // −1 za rámik.
      pridaj(l - 1, y - 0.5);
      pridaj(p, y - 0.5);
    }
  }
  for (let k = 0; k < sirka; k++)
    if (hore[k] >= 0) {
      pridaj(o.x0 + k - 0.5, hore[k] - 1);
      pridaj(o.x0 + k - 0.5, dole[k]);
    }
  return { body, rozpatie };
}

/**
 * Dorovná strany štvoruholníka na okraj oblasti. Štvoruholník vpísaný do
 * obalu pri pokrčenom či natrhnutom papieri reže rohy aj strany dovnútra;
 * tu sa každou stranou preloží priamka cez body okraja, ktoré k nej patria,
 * a posunie sa von tak, aby za ňou ostalo len pár vytŕčajúcich bodov.
 */
export function dorovnajStrany(rohy: Rohy, body: Bod[]): Rohy {
  const cx = (rohy[0].x + rohy[1].x + rohy[2].x + rohy[3].x) / 4;
  const cy = (rohy[0].y + rohy[1].y + rohy[2].y + rohy[3].y) / 4;
  const strany = rohy.map((a, s) => {
    const b = rohy[(s + 1) % 4];
    const dl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / dl;
    const uy = (b.y - a.y) / dl;
    let nx = uy;
    let ny = -ux;
    if (nx * ((a.x + b.x) / 2 - cx) + ny * ((a.y + b.y) / 2 - cy) < 0) ((nx = -nx), (ny = -ny));
    return { a, dl, ux, uy, nx, ny, body: [] as Bod[] };
  });
  // Každý bod okraja patrí k najbližšej strane, ak leží v jej strednej časti
  // a blízko nej. Ďaleko od strany sú body vnútri (napr. okraje dvoch
  // kúskov rozdeleného bločku), tie by priamku len vychýlili.
  const kratsia = Math.min(...strany.map((st) => st.dl));
  const dosah = Math.max(3, 0.15 * kratsia);
  for (const p of body) {
    let naj = -1;
    let najD = Infinity;
    for (let s = 0; s < 4; s++) {
      const st = strany[s];
      const t = (p.x - st.a.x) * st.ux + (p.y - st.a.y) * st.uy;
      if (t < 0.08 * st.dl || t > 0.92 * st.dl) continue;
      const d = Math.abs((p.x - st.a.x) * st.nx + (p.y - st.a.y) * st.ny);
      if (d < najD) ((najD = d), (naj = s));
    }
    if (naj >= 0 && najD < dosah) strany[naj].body.push(p);
  }
  const priamky = strany.map((st) => {
    const povodna = { nx: st.nx, ny: st.ny, c: st.nx * st.a.x + st.ny * st.a.y };
    if (st.body.length < 6) return povodna;
    // Smer priamky z hlavnej osi bodov (PCA 2×2).
    let mx = 0;
    let my = 0;
    for (const p of st.body) ((mx += p.x), (my += p.y));
    mx /= st.body.length;
    my /= st.body.length;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (const p of st.body) {
      const dx = p.x - mx;
      const dy = p.y - my;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    const uhol = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let nx = -Math.sin(uhol);
    let ny = Math.cos(uhol);
    if (nx * st.nx + ny * st.ny < 0) ((nx = -nx), (ny = -ny));
    // Nový smer sa od pôvodného nesmie veľmi líšiť (do ~10°).
    if (nx * st.nx + ny * st.ny < 0.985) ((nx = st.nx), (ny = st.ny));
    // Posun: von za 90 % bodov, zvyšok sú výčnelky a šum.
    const vzd = st.body.map((p) => p.x * nx + p.y * ny).sort((x, y) => x - y);
    const c = vzd[Math.min(vzd.length - 1, Math.floor(vzd.length * 0.9))];
    return { nx, ny, c };
  });
  const nove = rohy.map((roh, i) => {
    const p = priamky[(i + 3) % 4];
    const q = priamky[i];
    const det = p.nx * q.ny - p.ny * q.nx;
    if (Math.abs(det) < 1e-6) return roh;
    return { x: (p.c * q.ny - p.ny * q.c) / det, y: (p.nx * q.c - p.c * q.nx) / det };
  }) as Rohy;
  // Priesečník ďaleko od pôvodného rohu znamená, že sa niečo pokazilo.
  const mierka = Math.sqrt(plocha(rohy));
  for (let i = 0; i < 4; i++)
    if (Math.hypot(nove[i].x - rohy[i].x, nove[i].y - rohy[i].y) > 0.25 * mierka) return rohy;
  return nove;
}

/**
 * Ako veľmi sedia strany štvoruholníka na skutočnú hranu: podiel bodov na
 * strane, kde je kúsok dnu svetlejšie než kúsok von. Bod, za ktorým je už
 * okraj záberu, sa ráta za pol — doklad môže zo záberu trčať, ale celý
 * záber ešte nie je doklad. Vráti priemer, najhoršiu stranu (z tých, čo nie
 * sú na okraji záberu) a počet strán na okraji.
 */
function podporaHran(
  sive: Uint8Array,
  w: number,
  h: number,
  rohy: Rohy,
  rozdiel: number,
): { priemer: number; najhorsia: number; naOkraji: number; strany: number[] } {
  const cx = (rohy[0].x + rohy[1].x + rohy[2].x + rohy[3].x) / 4;
  const cy = (rohy[0].y + rohy[1].y + rohy[2].y + rohy[3].y) / 4;
  const d = Math.max(2, Math.round(Math.max(w, h) * 0.012));
  const k = 20;
  let sucet = 0;
  let najhorsia = 1;
  let naOkraji = 0;
  const strany: number[] = [];
  const hodnota = (x: number, y: number) => {
    const xi = x < 0 ? 0 : x > w - 1 ? w - 1 : Math.round(x);
    const yi = y < 0 ? 0 : y > h - 1 ? h - 1 : Math.round(y);
    return sive[yi * w + xi];
  };
  for (let s = 0; s < 4; s++) {
    const a = rohy[s];
    const b = rohy[(s + 1) % 4];
    const dl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = (b.y - a.y) / dl;
    let ny = -(b.x - a.x) / dl;
    // Normála von zo štvoruholníka.
    if (nx * ((a.x + b.x) / 2 - cx) + ny * ((a.y + b.y) / 2 - cy) < 0) ((nx = -nx), (ny = -ny));
    let dobre = 0;
    let mimo = 0;
    for (let i = 0; i < k; i++) {
      const t = (i + 0.5) / k;
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      const vx = px + nx * d;
      const vy = py + ny * d;
      const dx = px + 2 * nx * d;
      const dy = py + 2 * ny * d;
      // Kúsok za hranou je už okraj záberu — tam sa hrana zmerať nedá.
      if (
        dx < 0 ||
        dy < 0 ||
        dx > w - 1 ||
        dy > h - 1 ||
        px < 1 ||
        py < 1 ||
        px > w - 2 ||
        py > h - 2
      ) {
        mimo++;
        continue;
      }
      const dnu = hodnota(px - nx * d, py - ny * d);
      const von = Math.max(hodnota(vx, vy), hodnota(dx, dy));
      if (dnu - von >= rozdiel) dobre++;
    }
    sucet += (dobre + mimo * 0.5) / k;
    strany.push(mimo > k / 2 ? -1 : dobre / (k - mimo));
    if (mimo > k / 2) naOkraji++;
    else if (dobre / (k - mimo) < najhorsia) najhorsia = dobre / (k - mimo);
  }
  return { priemer: sucet / 4, najhorsia, naOkraji, strany };
}

/** Rohy stiahnuté do obrazu. */
function orezNaObraz(rohy: Rohy, w: number, h: number): Rohy {
  return rohy.map((b) => ({
    x: Math.max(0, Math.min(w, b.x)),
    y: Math.max(0, Math.min(h, b.y)),
  })) as Rohy;
}

/** Posunie každú stranu štvoruholníka von o `d` a vráti nové priesečníky. */
function rozsir(rohy: Rohy, d: number, w: number, h: number): Rohy {
  const cx = (rohy[0].x + rohy[1].x + rohy[2].x + rohy[3].x) / 4;
  const cy = (rohy[0].y + rohy[1].y + rohy[2].y + rohy[3].y) / 4;
  const priamky = rohy.map((a, s) => {
    const b = rohy[(s + 1) % 4];
    const dl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = (b.y - a.y) / dl;
    let ny = -(b.x - a.x) / dl;
    if (nx * ((a.x + b.x) / 2 - cx) + ny * ((a.y + b.y) / 2 - cy) < 0) ((nx = -nx), (ny = -ny));
    // Priamka nx·x + ny·y = c, posunutá von o d.
    return { nx, ny, c: nx * a.x + ny * a.y + d };
  });
  return rohy.map((roh, i) => {
    const p = priamky[(i + 3) % 4];
    const q = priamky[i];
    const det = p.nx * q.ny - p.ny * q.nx;
    // Takmer rovnobežné strany (nemalo by sa stať) — roh ostane.
    if (Math.abs(det) < 1e-6) return roh;
    const x = (p.c * q.ny - p.ny * q.c) / det;
    const y = (p.nx * q.c - p.c * q.nx) / det;
    return { x: Math.max(0, Math.min(w, x)), y: Math.max(0, Math.min(h, y)) };
  }) as Rohy;
}

/** Leží bod vnútri konvexného štvoruholníka (s rezervou `r` pixelov)? */
function vnutri(b: Bod, rohy: Rohy, r: number): boolean {
  const z = Math.sign(kriz(rohy[0], rohy[1], rohy[2]));
  for (let i = 0; i < 4; i++) {
    const p = rohy[i];
    const q = rohy[(i + 1) % 4];
    const dl = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    if ((z * kriz(p, q, b)) / dl < -r) return false;
  }
  return true;
}

/**
 * Nájde doklad na obraze aj s istotou. Rohy sú v pixeloch daného obrazu,
 * už s malým okrajom navyše; `null`, keď na ňom nič rozumné nie je.
 */
export function najdiDoklad(obr: Obraz): NajdenyDoklad | null {
  const { width: w, height: h } = obr;
  const dobri = kandidatiDokladu(obr).filter((k) => !k.dovod);
  if (!dobri.length) return null;
  let naj = dobri.reduce((a, b) => (b.skore > a.skore ? b : a));
  if (naj.skore < MIN_ISTOTA) return null;
  // Prísny prah občas odreže kus papiera (prehnutý roh, tieň). Keď je medzi
  // dobrými väčší obrys, ktorý víťaza celý obsahuje a je len o málo horší,
  // vezme sa ten — radšej kúsok stola navyše než odrezaný text.
  const rezerva = Math.max(w, h) * 0.02;
  for (const k of dobri)
    if (
      k.plocha > naj.plocha * 1.12 &&
      k.skore >= naj.skore - 0.12 &&
      naj.rohy.every((b) => vnutri(b, k.rohy, rezerva))
    )
      naj = k;
  return {
    rohy: rozsir(naj.rohy, OKRAJ_NAVYSE * Math.max(w, h), w, h),
    istota: Math.min(1, naj.skore),
    zdroj: naj.zdroj,
  };
}

/** Jeden skúšaný obrys aj s tým, prečo neprešiel (`dovod`). */
export type Kandidat = {
  rohy: Rohy;
  skore: number;
  zdroj: string;
  plocha: number;
  vyplna: number;
  priemer: number;
  najhorsia: number;
  /** Podpora každej strany (0–1), −1 pre stranu na okraji záberu. */
  strany: number[];
  dovod?: string;
};

/** Všetky skúšané obrysy — na ladenie a testy; vyberá z nich `najdiDoklad`. */
export function kandidatiDokladu(obr: Obraz): Kandidat[] {
  const { width: w, height: h } = obr;
  const vysledok: Kandidat[] = [];
  if (w < 16 || h < 16) return vysledok;
  const n = w * h;
  const sive = siveRozmazane(obr);
  const hist = new Float64Array(256);
  for (let i = 0; i < n; i++) hist[sive[i]]++;
  const { prah, rozdiel } = otsuZHistogramu(hist, n);
  // Bez kontrastu (prázdny stôl, tma, celá plocha papier) niet čo hľadať.
  if (rozdiel < 30) return vysledok;

  // Najsvetlejšia časť obrazu (98. percentil) — po ňu má zmysel prah dvíhať.
  let svetle = 255;
  for (let v = 255, s = 0; v >= 0; v--) {
    s += hist[v];
    if (s >= 0.02 * n) {
      svetle = v;
      break;
    }
  }
  const prahy = [prah];
  // Prísnejší prah odreže odlesk či svetlý kus stola, ktorý je o kúsok
  // tmavší než papier.
  const prisny = Math.round(prah + (svetle - prah) * 0.3);
  if (prisny - prah >= 6 && prisny < svetle - 4) prahy.push(prisny);
  // Rozdiel jasu, ktorý ešte rátame ako hranu dokladu.
  const hrana = Math.max(10, Math.min(30, rozdiel * 0.25));
  const miestny = miestnyKontrast(sive, w, h, Math.round(Math.max(w, h) / 8));
  const miestnyPrah = 128 + Math.max(6, Math.round(rozdiel * 0.12));

  const W = w + 2;
  const H = h + 2;
  const znacka = new Int32Array(W * H);
  const zasobnik = new Int32Array(W * H);
  const maska = new Uint8Array(W * H);
  /** Štvoruholník z bodov okraja a jeho skóre. */
  const posud = (body: Bod[], rozpatie: number, meno: string) => {
    const hrube = stvoruholnik(konvexnyObal(body));
    if (!hrube) return;
    const rohy = orezNaObraz(dorovnajStrany(hrube, body), w, h);
    const pl = plocha(rohy);
    const k: Kandidat = {
      rohy,
      skore: 0,
      zdroj: meno,
      plocha: pl,
      vyplna: 0,
      priemer: 0,
      najhorsia: 0,
      strany: [],
    };
    vysledok.push(k);
    if (!rozumneRohy(rohy, w, h)) {
      k.dovod = "tvar";
      return;
    }
    k.vyplna = Math.min(rozpatie, n) / pl;
    const podpora = podporaHran(sive, w, h, rohy, hrana);
    k.priemer = podpora.priemer;
    k.najhorsia = podpora.najhorsia;
    k.strany = podpora.strany;
    k.skore =
      podpora.priemer * 0.6 +
      podpora.najhorsia * 0.2 +
      Math.min(1, k.vyplna) * 0.2 +
      // Pri rovnakej kvalite radšej väčší doklad než jeho kúsok.
      Math.sqrt(pl / n) * 0.1;
    if (podpora.naOkraji >= 3) k.dovod = "celý záber";
    else if (k.vyplna < 0.8 || k.vyplna > 1.15) k.dovod = "výplň";
    else if (podpora.najhorsia < 0.35 || podpora.priemer < 0.6) k.dovod = "hrany";
  };

  const pokusy = prahy.map((t) => ({ obraz: sive, t, meno: `prah ${t}` }));
  pokusy.push({ obraz: miestny, t: miestnyPrah, meno: "miestny" });

  for (const { obraz, t, meno } of pokusy) {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      const om = (y + 1) * W + 1;
      for (let x = 0; x < w; x++) maska[om + x] = obraz[o + x] > t ? 1 : 0;
    }
    // Tri najväčšie oblasti, ktoré nie sú drobné ani celý obraz.
    const zoznam = oblasti(maska, W, H, znacka, zasobnik, MIN_PLOCHA * n * 0.5, 0.97 * n, 3);
    const okraje = zoznam.map((o) => okrajOblasti(znacka, W, o, w, h));
    okraje.forEach((o) => posud(o.body, o.rozpatie, meno));
    // Tieň či prehyb môže bloček rozdeliť na kúsky nad sebou — skúsi sa aj
    // spojenie dvoch a troch najväčších. Či ide o jeden papier, rozhodnú
    // hrany a výplň.
    for (let kolko = 2; kolko <= okraje.length; kolko++) {
      const kusy = okraje.slice(0, kolko);
      posud(
        kusy.flatMap((o) => o.body),
        kusy.reduce((s, o) => s + o.rozpatie, 0),
        `${meno} spojené ${kolko}`,
      );
    }
  }
  return vysledok;
}

/**
 * Nájde doklad na obraze. Rohy sú v pixeloch daného obrazu; `null`, keď na
 * ňom nič rozumné nie je.
 */
export function najdiOkraje(obr: Obraz): Rohy | null {
  return najdiDoklad(obr)?.rohy ?? null;
}

/** Rohy z menšieho obrazu prepočítané na väčší. */
export function zvacsiRohy(rohy: Rohy, k: number): Rohy {
  return rohy.map((b) => ({ x: b.x * k, y: b.y * k })) as Rohy;
}
