/*
  Výber v Iných dokladoch (H-02, H-03): hromadné akcie a „Označiť všetky“ len nad
  zobrazenými riadkami (filter priečinka, štítka a hľadania), nie nad celou záložkou.
  Tenká vrstva nad `vyber-zobrazenych.ts` pre riadky s `id`.
*/
import {
  prepniVsetkyZobrazene as prepni,
  vsetkyZobrazeneVybrane as vsetky,
  vybraneZobrazene as vybrane,
} from "./vyber-zobrazenych";

type SId = { id: string };
const id = (r: SId) => r.id;

/** Vybrané riadky, ktoré sú aj zobrazené. */
export function vybraneZobrazene<T extends SId>(
  selected: ReadonlySet<string>,
  zobrazene: readonly T[],
): T[] {
  return vybrane(zobrazene, selected, id);
}

/** Na čo pôjde hromadná akcia: s výberom vybrané zobrazené, bez výberu všetky zobrazené. */
export function naHromadnuAkciu<T extends SId>(
  selected: ReadonlySet<string>,
  zobrazene: readonly T[],
): T[] {
  return selected.size ? vybraneZobrazene(selected, zobrazene) : [...zobrazene];
}

export function vsetkyZobrazeneVybrane(
  selected: ReadonlySet<string>,
  zobrazene: readonly SId[],
): boolean {
  return vsetky(zobrazene.map(id), selected);
}

/** „Označiť všetky“: pridá/odoberie len zobrazené, ostatný výber nechá. */
export function prepniVsetkyZobrazene(
  selected: ReadonlySet<string>,
  zobrazene: readonly SId[],
): Set<string> {
  return prepni(selected, zobrazene.map(id));
}
