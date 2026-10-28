/*
  Zmena zaúčtovania bločku / výdavkového dokladu (zauctujDokladyFn).

  Prázdne pole nechá, čo na doklade je — tak to chce hromadné zaúčtovanie
  (vyplnené sa nastaví na všetkých vybraných, prázdne nič nemení). Vyprázdniť
  kód sa dá len výslovne cez `vymazat`, napr. z detailu bločku, kde používateľ
  pole zmaže. Vyplnená hodnota má prednosť pred vymazaním toho istého poľa.
*/

/** Polia, ktoré sa dajú výslovne vymazať, a ich stĺpce v `expense_documents`. */
export const STLPCE_ZAUCTOVANIA_DOKLADU = {
  pokladna: "pohoda_pokladna",
  kv: "kv_clenenie",
  stredisko: "stredisko",
  cinnost: "cinnost",
  rad: "pohoda_rad",
  predkontacia: "pohoda_predkontacia",
  clenenie: "pohoda_clenenie_dph",
} as const;

export type PoleZauctovaniaDokladu = keyof typeof STLPCE_ZAUCTOVANIA_DOKLADU;

export const POLIA_ZAUCTOVANIA_DOKLADU = Object.keys(
  STLPCE_ZAUCTOVANIA_DOKLADU,
) as PoleZauctovaniaDokladu[];

export type VstupZauctovaniaDokladu = Partial<
  Record<PoleZauctovaniaDokladu | "kategoria", string | null | undefined>
> & { vymazat?: PoleZauctovaniaDokladu[] | null };

/** Stĺpce na update dokladu. `kv: "auto"` = automatické členenie (null). */
export function zmenaZauctovaniaDokladu(d: VstupZauctovaniaDokladu): Record<string, unknown> {
  const zmena: Record<string, unknown> = {};
  for (const pole of POLIA_ZAUCTOVANIA_DOKLADU) {
    const v = d[pole]?.trim();
    if (!v) continue;
    zmena[STLPCE_ZAUCTOVANIA_DOKLADU[pole]] = pole === "kv" && v === "auto" ? null : v;
  }
  const kategoria = d.kategoria?.trim();
  if (kategoria) zmena.category = kategoria;
  for (const pole of d.vymazat ?? []) {
    const stlpec = STLPCE_ZAUCTOVANIA_DOKLADU[pole];
    if (stlpec && !(stlpec in zmena)) zmena[stlpec] = null;
  }
  return zmena;
}
