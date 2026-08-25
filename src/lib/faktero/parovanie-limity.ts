/**
 * Koľko platieb párovanie berie do úvahy.
 *
 * Konštanty sú zvlášť, lebo ich potrebuje aj stránka so zoznamom faktúr —
 * odznak „Spárovať platby" musí počítať presne to, čo párovacia stránka
 * dokáže zobraziť. Kým to boli dve rôzne čísla, odznak hlásil tisíce platieb,
 * na ktoré sa nedalo dostať.
 */

/** Staršie platby sa už nepárujú — faktúra k nim dávno nie je otvorená. */
export const DNI_PAROVANIA = 400;

/** Strop na jedno načítanie. PostgREST viac naraz aj tak nedá rozumne. */
export const MAX_PAROVANIA = 2000;
