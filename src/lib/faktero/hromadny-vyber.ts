/*
  Hromadný výber riadkov v tabuľke (zaškrtávadlá) — čistá logika bez Reactu,
  aby sa dala otestovať. Hook `useHromadnyVyber` ju len drží v stave.

  Pravidlá (zadanie Patrika, 2026-11-04):
  - „Označiť všetko" označí len riadky, ktoré sú práve viditeľné po filtri.
  - Hlavičkové zaškrtávadlo je „indeterminate", keď je označená len časť.
  - Shift+klik označí (alebo odznačí) rozsah od posledného kliknutého riadku.
  - Riadok, ktorý po zmene filtra zmizne zo zoznamu, sa z výberu vyhodí —
    hromadná akcia nesmie zasiahnuť nič, čo človek nevidí.
*/

export type StavHlavicky = "nic" | "cast" | "vsetko";

/** Stav hlavičkového zaškrtávadla podľa viditeľných riadkov. */
export function stavHlavicky(viditelne: readonly string[], oznacene: ReadonlySet<string>): StavHlavicky {
  if (!viditelne.length) return "nic";
  let n = 0;
  for (const id of viditelne) if (oznacene.has(id)) n++;
  if (n === 0) return "nic";
  return n === viditelne.length ? "vsetko" : "cast";
}

/**
 * Klik na hlavičku: keď je označené všetko viditeľné, výber sa zruší;
 * inak sa označí všetko viditeľné (aj pri čiastočnom výbere).
 */
export function prepniVsetky(viditelne: readonly string[], oznacene: ReadonlySet<string>): Set<string> {
  return stavHlavicky(viditelne, oznacene) === "vsetko" ? new Set() : new Set(viditelne);
}

/**
 * Klik na zaškrtávadlo riadku. So Shiftom a známym posledným riadkom (ktorý
 * je stále viditeľný) dostane celý rozsah ten stav, ktorý dostal kliknutý
 * riadok — ako v Gmaili či prieskumníkovi súborov.
 */
export function prepniRiadok(
  viditelne: readonly string[],
  oznacene: ReadonlySet<string>,
  id: string,
  moznosti: { shift?: boolean; posledny?: string | null } = {},
): Set<string> {
  const novy = new Set(oznacene);
  const zapnut = !oznacene.has(id);
  const odkial = moznosti.shift && moznosti.posledny ? viditelne.indexOf(moznosti.posledny) : -1;
  const kam = viditelne.indexOf(id);
  if (odkial >= 0 && kam >= 0) {
    const [a, b] = odkial < kam ? [odkial, kam] : [kam, odkial];
    for (const x of viditelne.slice(a, b + 1)) {
      if (zapnut) novy.add(x);
      else novy.delete(x);
    }
    return novy;
  }
  if (zapnut) novy.add(id);
  else novy.delete(id);
  return novy;
}

/** Výber zúžený na viditeľné riadky. Vráti ten istý objekt, keď sa nič nezmenilo (bez zbytočného prekreslenia). */
export function zuzNaViditelne(viditelne: readonly string[], oznacene: Set<string>): Set<string> {
  if (!oznacene.size) return oznacene;
  const vid = new Set(viditelne);
  let zmena = false;
  const novy = new Set<string>();
  for (const id of oznacene) {
    if (vid.has(id)) novy.add(id);
    else zmena = true;
  }
  return zmena ? novy : oznacene;
}

/** Najviac koľko kódov vypíše potvrdenie mazania menovite. */
export const MAX_KODOV_V_ZOZNAME = 10;

/**
 * Zoznam kódov do potvrdenia či hlášky: prvých 10 menovite, zvyšok ako
 * „+ N ďalších". `dalsich` dostane počet a vráti preložený text.
 */
export function zoznamKodov(
  kody: readonly string[],
  dalsich: (n: number) => string,
  max = MAX_KODOV_V_ZOZNAME,
): string {
  const prve = kody.slice(0, max).join(", ");
  return kody.length > max ? `${prve} ${dalsich(kody.length - max)}` : prve;
}
