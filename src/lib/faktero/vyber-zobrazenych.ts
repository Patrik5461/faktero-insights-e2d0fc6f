/*
  Výber v zozname s filtrami (Na kontrolu). Výber môže obsahovať aj riadky,
  ktoré aktuálny filter skryl — hromadná akcia a jej počet sa preto rátajú len
  zo zobrazených (E-23) a „Vybrať všetky“ pridáva/odoberá len zobrazené, výber
  z iných filtrov nechá (E-24).
*/

/** Riadky, na ktoré hromadná akcia naozaj pôjde: zobrazené ∩ vybrané ∩ spĺňajú podmienku. */
export function vybraneZobrazene<T>(
  zobrazene: readonly T[],
  vybrane: ReadonlySet<string>,
  kluc: (r: T) => string,
  podmienka: (r: T) => boolean = () => true,
): T[] {
  return zobrazene.filter((r) => vybrane.has(kluc(r)) && podmienka(r));
}

/** Sú vybrané všetky zobrazené riadky? (Prázdny zoznam = nie.) */
export function vsetkyZobrazeneVybrane(
  zobrazeneKluce: readonly string[],
  vybrane: ReadonlySet<string>,
): boolean {
  return zobrazeneKluce.length > 0 && zobrazeneKluce.every((k) => vybrane.has(k));
}

/** „Vybrať všetky“: keď sú všetky zobrazené vybrané, odoberie ich; inak ich pridá. Ostatné nechá. */
export function prepniVsetkyZobrazene(
  vybrane: ReadonlySet<string>,
  zobrazeneKluce: readonly string[],
): Set<string> {
  const novy = new Set(vybrane);
  if (vsetkyZobrazeneVybrane(zobrazeneKluce, vybrane))
    for (const k of zobrazeneKluce) novy.delete(k);
  else for (const k of zobrazeneKluce) novy.add(k);
  return novy;
}
