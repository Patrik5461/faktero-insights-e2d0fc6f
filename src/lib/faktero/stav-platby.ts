/**
 * Stav platby dokladu pre ikonku banky v zoznamoch (prijaté faktúry, bločky,
 * doklady, ostatné doklady). Čistá funkcia — údaje si pripraví zoznam.
 *
 * - `sparovana` (zelená) — doklad má väzbu na pohyb z účtu,
 * - `navrh` (oranžová) — párovanie našlo pravdepodobný pohyb, čaká na klik človeka,
 * - `nenajdena` (červená) — má sa platiť prevodom, nie je uhradený a pohyb sa nenašiel,
 * - `null` — nie je čo párovať (koncept, storno, hotovosť/karta, ručne uhradené…).
 *
 * Nič sa nepáruje potichu: `navrh` je len ponuka, potvrdenie je vždy na človeku.
 */
export type StavPlatby = "sparovana" | "navrh" | "nenajdena";

export function stavPlatby(d: {
  /** Má väzbu na pohyb z účtu. */
  sparovana: boolean;
  /** Párovanie našlo pohyb. */
  maNavrh: boolean;
  /** `payment_method` prevod / bank_transfer / prázdne pri faktúre. */
  platiSaPrevodom: boolean;
  /** Stav paid / vyplnený `payment_date`. */
  uhradena: boolean;
  /** Nie koncept, storno, vymazaná. */
  aktivna: boolean;
}): StavPlatby | null {
  if (!d.aktivna) return null;
  // Väzba na pohyb platí aj vtedy, keď je doklad už uhradený (potvrdením sa uhradí).
  if (d.sparovana) return "sparovana";
  // Ručne označený ako zaplatený bez pohybu — nie je čo párovať ani hľadať.
  if (d.uhradena) return null;
  // Návrh sa ukáže aj pri platbe kartou: aj tá býva na výpise z účtu.
  if (d.maNavrh) return "navrh";
  if (d.platiSaPrevodom) return "nenajdena";
  return null;
}
