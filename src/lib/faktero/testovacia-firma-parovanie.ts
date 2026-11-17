/*
  Párovanie vlastnej firmy podľa IČO / DIČ / IČ DPH / IBAN a testovacia firma.

  Testovacia firma („Test – <názov>“) má IČO NULL, ale DIČ, IČ DPH, adresu aj
  IBAN skopírované zo skutočnej firmy. Každé automatické párovanie dokladu na
  firmu podľa týchto údajov by ju preto našlo spolu so skutočnou (alebo
  namiesto nej). Pravidlo: automatika vyberá len zo skutočných firiem; do
  testovacej sa doklad dostane len ručným výberom.

  Čisté funkcie (bez databázy) — v dotazoch nad `companies` je ekvivalent
  `.is("testovacia_pre", null)`.
*/

import { jeTestovacia, type FirmaSTestom } from "./testovacia-firma";

/** Kandidáti na automatické párovanie — bez testovacích firiem. */
export function bezTestovacich<T extends { testovacia_pre?: string | null }>(firmy: T[]): T[] {
  return firmy.filter((f) => !jeTestovacia(f));
}

/**
 * Smie ísť presun skladu medzi týmito dvoma firmami? Medzi skutočnou a
 * testovacou nie (ani jedným smerom) — ostré zásoby by sa premiešali so
 * skúšobnými. Skutočná ↔ skutočná a testovacia ↔ testovacia áno.
 */
export function presunMedziFirmamiPovoleny(zdroj: FirmaSTestom, ciel: FirmaSTestom): boolean {
  return jeTestovacia(zdroj) === jeTestovacia(ciel);
}

export const HLASKA_PRESUN_TESTOVACIA =
  "Presun medzi skutočnou a testovacou firmou nie je možný — ostré zásoby by sa premiešali so skúšobnými.";
