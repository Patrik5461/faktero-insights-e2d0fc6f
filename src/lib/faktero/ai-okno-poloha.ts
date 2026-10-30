/**
 * Poloha plávajúceho okna AI asistenta a jeho tlačidla.
 *
 * Človek si okno chatu (a tlačidlo AI) odtiahne tam, kde mu nezavadzia. Poloha
 * je ľavý horný roh v pixeloch okna prehliadača; `null` znamená pôvodné miesto
 * vpravo dole, ktoré kreslí CSS. Na úzkej obrazovke je okno na celú šírku,
 * presúvanie tam nemá zmysel a uložená poloha sa ignoruje.
 */

export type Poloha = { x: number; y: number };
export type Rozmer = { sirka: number; vyska: number };

/** Najmenší odstup od okraja obrazovky. */
export const OKRAJ = 8;
/** Od tejto šírky (Tailwind `sm`) sa dá okno presúvať. */
export const SIROKA_OBRAZOVKA = 640;
/** O koľko pixelov sa musí ukazovateľ pohnúť, aby to bolo ťahanie a nie klik. */
export const PRAH_TAHU = 5;

export const KLUC_OKNO = "faktero.ai-okno.poloha";
export const KLUC_TLACIDLO = "faktero.ai-tlacidlo.poloha";

/** Posunie polohu tak, aby celý prvok ostal na obrazovke (aspoň `okraj` od kraja). */
export function ohranicPolohu(p: Poloha, prvok: Rozmer, obrazovka: Rozmer, okraj = OKRAJ): Poloha {
  const os = (hodnota: number, velkost: number, priestor: number) => {
    const max = priestor - velkost - okraj;
    // Prvok väčší ako obrazovka: prilepí sa k ľavému/hornému okraju, aby
    // hlavička (za ktorú sa ťahá) ostala vždy viditeľná.
    if (max < okraj) return okraj;
    return Math.min(Math.max(hodnota, okraj), max);
  };
  return {
    x: Math.round(os(p.x, prvok.sirka, obrazovka.sirka)),
    y: Math.round(os(p.y, prvok.vyska, obrazovka.vyska)),
  };
}

/** Je pohyb od stlačenia už ťahaním? Menší pohyb je klik (trasúca sa ruka, dotyk). */
export function jeTah(dx: number, dy: number, prah = PRAH_TAHU): boolean {
  return Math.hypot(dx, dy) >= prah;
}

/**
 * Pôvodné miesto okna, keď je tlačidlo presunuté: nad tlačidlom, zarovnané
 * k jeho pravému okraju. Ak nad ním nie je miesto, okno sa otvorí pod ním.
 */
export function polohaOknaPriTlacidle(
  tlacidlo: Poloha & Rozmer,
  okno: Rozmer,
  obrazovka: Rozmer,
  medzera = 12,
): Poloha {
  const x = tlacidlo.x + tlacidlo.sirka - okno.sirka;
  const nad = tlacidlo.y - medzera - okno.vyska;
  const y = nad >= OKRAJ ? nad : tlacidlo.y + tlacidlo.vyska + medzera;
  return ohranicPolohu({ x, y }, okno, obrazovka);
}

/** Prečíta uloženú polohu; čokoľvek nečitateľné je „pôvodné miesto“. */
export function precitajPolohu(text: string | null | undefined): Poloha | null {
  if (!text) return null;
  try {
    const p = JSON.parse(text) as unknown;
    if (!p || typeof p !== "object") return null;
    const { x, y } = p as Record<string, unknown>;
    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}

export function nacitajPolohu(kluc: string): Poloha | null {
  try {
    return precitajPolohu(window.localStorage.getItem(kluc));
  } catch {
    return null;
  }
}

export function ulozPolohu(kluc: string, p: Poloha | null): void {
  try {
    if (p) window.localStorage.setItem(kluc, JSON.stringify(p));
    else window.localStorage.removeItem(kluc);
  } catch {
    // Súkromné okno alebo zablokované úložisko: poloha platí len do obnovenia stránky.
  }
}
