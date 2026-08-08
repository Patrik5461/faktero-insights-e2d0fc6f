/**
 * Návrh doobjednania — prevzaté z Pohody, ktorá pri zásobe vedie minimálny aj
 * optimálny stav.
 *
 * Rozdiel je podstatný. Minimum je hranica, pri ktorej sa má objednávať;
 * optimum je stav, na ktorý sa má doobjednať. Keď sa dopĺňa len po minimum,
 * zásoba je hneď po dodávke znovu na hranici a hlási sa ako nedostatková —
 * objednáva sa tak neustále po malých dávkach.
 *
 * Do výpočtu vstupuje **disponibilné** množstvo, teda stav znížený o rezervácie.
 * Fyzicky plný sklad, ktorého obsah je celý rezervovaný, treba objednať rovnako
 * ako prázdny.
 *
 * Pohoda počíta aj s množstvom už objednaným u dodávateľa. Faktero objednávky
 * u dodávateľov zatiaľ nevedie, takže tá časť tu chýba — keď pribudnú, stačí
 * ich odpočítať od potrebného množstva na jednom mieste nižšie.
 */

export type ZasobaNaDoobjednanie = {
  stock_item_id: string;
  sku: string | null;
  nazov: string;
  unit: string | null;
  on_hand: number;
  reserved: number;
  min_stock: number;
  optimal_stock: number;
};

export type NavrhObjednavky = ZasobaNaDoobjednanie & {
  /** Stav znížený o rezervácie. */
  available: number;
  /** Koľko treba objednať, aby sa dosiahol cieľový stav. */
  objednat: number;
  /** Stav, na ktorý sa dopĺňa. */
  cielovy_stav: number;
};

function cislo(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Cieľový stav je optimum; keď nie je nastavené, dopĺňa sa aspoň po minimum.
 * Optimum nižšie než minimum je preklep v karte — brať sa musí to vyššie,
 * inak by návrh objednal menej, než je vlastná hranica nedostatku.
 */
export function cielovyStav(minStock: unknown, optimalStock: unknown): number {
  const min = Math.max(0, cislo(minStock));
  const opt = Math.max(0, cislo(optimalStock));
  return opt > 0 ? Math.max(min, opt) : min;
}

export function navrhniObjednavku(z: ZasobaNaDoobjednanie): NavrhObjednavky | null {
  const available = cislo(z.on_hand) - cislo(z.reserved);
  const min = Math.max(0, cislo(z.min_stock));
  const ciel = cielovyStav(z.min_stock, z.optimal_stock);

  // Bez nastavenej hranice sa nedá povedať, že zásoba chýba.
  if (min <= 0 && ciel <= 0) return null;
  // Hlási sa až pri dosiahnutí hranice, nie tesne nad ňou.
  if (available > min) return null;

  const objednat = ciel - available;
  if (objednat <= 0) return null;

  return {
    ...z,
    available,
    objednat: Math.round(objednat * 10_000) / 10_000,
    cielovy_stav: ciel,
  };
}

/** Najskôr tie, ktoré chýbajú najviac oproti svojej hranici. */
export function navrhniObjednavky(zasoby: ZasobaNaDoobjednanie[]): NavrhObjednavky[] {
  return zasoby
    .map(navrhniObjednavku)
    .filter((x): x is NavrhObjednavky => x !== null)
    .sort((a, b) => b.min_stock - b.available - (a.min_stock - a.available));
}
