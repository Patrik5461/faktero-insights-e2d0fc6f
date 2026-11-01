/**
 * SuperFaktúra: na validáciu (krok 4) sa dá prísť z náhľadu („Importovať
 * automaticky“, krok 2) aj z mapovania (krok 3). „Späť“ vracia tam, odkiaľ
 * človek prišiel — predtým vždy na mapovanie.
 */
export function krokSpatZValidacie(odkial: 2 | 3 | null | undefined): 2 | 3 {
  return odkial ?? 3;
}
