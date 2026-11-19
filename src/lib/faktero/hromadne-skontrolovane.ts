/*
  Hromadné „Skontrolované“ v zoznamoch Prijatých faktúr a Bločkov — tá istá
  zmena ako tlačidlo na detaile (`AutomatickyZaradena.tsx`): zmaže
  `na_kontrolu_at` aj `na_kontrolu_dovod`. Počíta a mení sa len doklad, ktorý
  na kontrolu naozaj čaká (štítok „Na kontrolu“ — eFaktúra zaradená
  automaticky alebo rozpis DPH z AI, ktorý neprešiel kontrolou).
*/

export type RiadokNaKontrolu = {
  id: string;
  na_kontrolu_at?: string | null;
  deleted_at?: string | null;
};

/** Čaká doklad na kontrolu (ukazuje „Na kontrolu“)? */
export function cakaNaKontrolu(r: RiadokNaKontrolu | null | undefined): boolean {
  return !!r && !!r.na_kontrolu_at && !r.deleted_at;
}

/** Id označených dokladov, ktoré čakajú na kontrolu (poradie podľa zoznamu). */
export function vybraneNaKontrolu(
  riadky: readonly RiadokNaKontrolu[],
  vybrane: ReadonlySet<string>,
): string[] {
  return riadky.filter((r) => vybrane.has(r.id) && cakaNaKontrolu(r)).map((r) => r.id);
}

/** Zmena, ktorú zapíše detail aj hromadná akcia. */
export const ZMENA_SKONTROLOVANE = { na_kontrolu_at: null, na_kontrolu_dovod: null } as const;
