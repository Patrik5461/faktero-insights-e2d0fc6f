/**
 * Sadzby DPH členských štátov EÚ — pre predaj spotrebiteľom cez režim OSS.
 *
 * Pri predaji tovaru a digitálnych služieb nezdaniteľným osobám do iných
 * členských štátov sa po prekročení hranice 10 000 eur za rok uplatňuje sadzba
 * krajiny zákazníka a daň sa odvádza cez jedno kontaktné miesto (One Stop Shop,
 * § 68a a nasl. zákona o DPH). Bez tabuľky cudzích sadzieb sa taká faktúra
 * vystaviť nedá.
 *
 * Stav k septembru 2026 podľa prehľadu sadzieb členských štátov. Znížené sadzby
 * platia len pre vybrané tovary a služby — ktoré to sú, sa líši štát od štátu,
 * takže výber sadzby ostáva na tom, kto faktúru vystavuje.
 */

export type SadzbyStatu = {
  kod: string;
  nazov: string;
  zakladna: number;
  znizene: number[];
};

export const SADZBY_EU: SadzbyStatu[] = [
  { kod: "AT", nazov: "Rakúsko", zakladna: 20, znizene: [13, 10] },
  { kod: "BE", nazov: "Belgicko", zakladna: 21, znizene: [12, 6] },
  { kod: "BG", nazov: "Bulharsko", zakladna: 20, znizene: [9] },
  { kod: "HR", nazov: "Chorvátsko", zakladna: 25, znizene: [13, 5] },
  { kod: "CY", nazov: "Cyprus", zakladna: 19, znizene: [9, 5] },
  { kod: "CZ", nazov: "Česko", zakladna: 21, znizene: [12] },
  { kod: "DK", nazov: "Dánsko", zakladna: 25, znizene: [] },
  { kod: "EE", nazov: "Estónsko", zakladna: 24, znizene: [13, 9] },
  { kod: "FI", nazov: "Fínsko", zakladna: 25.5, znizene: [14, 10] },
  { kod: "FR", nazov: "Francúzsko", zakladna: 20, znizene: [10, 5.5, 2.1] },
  { kod: "DE", nazov: "Nemecko", zakladna: 19, znizene: [7] },
  { kod: "GR", nazov: "Grécko", zakladna: 24, znizene: [13, 6] },
  { kod: "HU", nazov: "Maďarsko", zakladna: 27, znizene: [18, 5] },
  { kod: "IE", nazov: "Írsko", zakladna: 23, znizene: [13.5, 9, 4.8] },
  { kod: "IT", nazov: "Taliansko", zakladna: 22, znizene: [10, 5, 4] },
  { kod: "LV", nazov: "Lotyšsko", zakladna: 21, znizene: [12, 5] },
  { kod: "LT", nazov: "Litva", zakladna: 21, znizene: [9, 5] },
  { kod: "LU", nazov: "Luxembursko", zakladna: 17, znizene: [8, 3] },
  { kod: "MT", nazov: "Malta", zakladna: 18, znizene: [7, 5] },
  { kod: "NL", nazov: "Holandsko", zakladna: 21, znizene: [9] },
  { kod: "PL", nazov: "Poľsko", zakladna: 23, znizene: [8, 5] },
  { kod: "PT", nazov: "Portugalsko", zakladna: 23, znizene: [13, 6] },
  { kod: "RO", nazov: "Rumunsko", zakladna: 21, znizene: [11] },
  { kod: "SK", nazov: "Slovensko", zakladna: 23, znizene: [19, 5] },
  { kod: "SI", nazov: "Slovinsko", zakladna: 22, znizene: [9.5, 5] },
  { kod: "ES", nazov: "Španielsko", zakladna: 21, znizene: [10, 4] },
  { kod: "SE", nazov: "Švédsko", zakladna: 25, znizene: [12, 6] },
];

const PODLA_KODU = new Map(SADZBY_EU.map((s) => [s.kod, s]));

export function statEu(kod: string | null | undefined): SadzbyStatu | null {
  return PODLA_KODU.get(String(kod ?? "").toUpperCase()) ?? null;
}

/** Sadzby do výberu pre danú krajinu — od najvyššej, vrátane nuly. */
export function sadzbyStatu(kod: string | null | undefined): number[] {
  const s = statEu(kod);
  if (!s) return [0];
  return [...new Set([s.zakladna, ...s.znizene, 0])].sort((a, b) => b - a);
}

export function zakladnaSadzbaStatu(kod: string | null | undefined): number {
  return statEu(kod)?.zakladna ?? 0;
}

/** Hranica, po prekročení ktorej sa predaj spotrebiteľom v EÚ zdaňuje v ich štáte. */
export const PRAH_OSS = 10000;

/**
 * Stav voči hranici 10 000 € za kalendárny rok.
 *
 * Do hranice sa počíta predaj tovaru na diaľku a digitálnych služieb
 * nezdaniteľným osobám do všetkých členských štátov spolu, nie do každého
 * zvlášť — to je častý omyl.
 */
export function stavPrahu(predajZaRok: number): {
  prekroceny: boolean;
  zostava: number;
  podiel: number;
} {
  const suma = Math.max(0, Number(predajZaRok) || 0);
  return {
    prekroceny: suma > PRAH_OSS,
    zostava: Math.max(0, Math.round((PRAH_OSS - suma) * 100) / 100),
    podiel: Math.min(1, suma / PRAH_OSS),
  };
}
