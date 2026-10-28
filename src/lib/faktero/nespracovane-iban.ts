/*
  Typ faktúry podľa firemných IBAN-ov (nastavenie Nespracovaných
  `typPodlaIban`).

  Do Nespracovaných občas príde aj faktúra, ktorú firma sama vystavila —
  preposlaná kópia, odberateľ ju poslal späť, alebo ju niekto nahral omylom.
  Na pohľad vyzerá ako každá iná, ale peniaze podľa nej majú prísť NA účet
  firmy: príjemca platby (IBAN, ktorý AI vyčíta ako IBAN dodávateľa) je
  jeden z firemných účtov. Taký doklad nie je prijatá faktúra — založiť ho
  medzi prijaté by z výnosu urobilo náklad.
*/

export type UcetFirmy = { iban: string; nazov?: string | null };

/** IBAN na porovnanie — bez medzier a pomlčiek, veľkými písmenami. */
export function normalizujIban(iban: string | null | undefined): string {
  return String(iban ?? "")
    .replace(/[\s -]+/g, "")
    .toUpperCase();
}

/** Firemný účet, ktorého IBAN je na doklade ako príjemca platby (null = žiadny). */
export function vlastnyUcetDokladu(
  ibanDokladu: string | null | undefined,
  ucty: UcetFirmy[],
): UcetFirmy | null {
  const iban = normalizujIban(ibanDokladu);
  // Kratšie by nebol IBAN (najkratší, nórsky, má 15 znakov).
  if (iban.length < 15) return null;
  return ucty.find((u) => normalizujIban(u.iban) === iban) ?? null;
}

/** Druhy, pri ktorých by vlastná faktúra skončila omylom medzi prijatými. */
const PRIJATE = new Set(["faktura", "zalohova", "dobropis"]);

/**
 * Je doklad podľa IBAN-u vystavená faktúra firmy? Platí, keď je nastavenie
 * zapnuté, doklad je (alebo môže byť) faktúra a jeho IBAN patrí firme.
 * Bloček ani iný doklad sa nekontroluje — tam IBAN o smere platby nehovorí.
 */
export function vystavenaPodlaIban(args: {
  zapnute: boolean;
  druh: string | null | undefined;
  ibanDokladu: string | null | undefined;
  ucty: UcetFirmy[];
}): UcetFirmy | null {
  if (!args.zapnute) return null;
  if (args.druh && !PRIJATE.has(args.druh)) return null;
  return vlastnyUcetDokladu(args.ibanDokladu, args.ucty);
}
