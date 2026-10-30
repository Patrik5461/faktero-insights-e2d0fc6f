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
  const s = smerPodlaIban(args);
  return s?.smer === "vystavena" ? s.ucet : null;
}

/**
 * Účty firmy z oboch zdrojov — ručne zadané (`company_bank_accounts`),
 * napojené banky (`bank_accounts`) a IBAN z hlavičky firmy. Ten istý IBAN
 * sa ráta raz; meno má prednosť to, ktoré je vyplnené.
 */
export function uctyFirmy(...zdroje: (UcetFirmy[] | null | undefined)[]): UcetFirmy[] {
  const out = new Map<string, UcetFirmy>();
  for (const zdroj of zdroje)
    for (const u of zdroj ?? []) {
      const kluc = normalizujIban(u?.iban);
      if (kluc.length < 15) continue;
      const bolo = out.get(kluc);
      if (!bolo) out.set(kluc, { iban: String(u.iban).trim(), nazov: u.nazov?.trim() || null });
      else if (!bolo.nazov && u.nazov?.trim()) bolo.nazov = u.nazov.trim();
    }
  return [...out.values()];
}

/**
 * Smer faktúry podľa IBAN-ov na nej — silný signál pri rozhodovaní, či je to
 * prijatá, alebo vlastná vystavená faktúra. Dôvod sa ukazuje v rozhraní.
 *
 * - `vystavena` — IBAN príjemcu platby je firemný (peniaze majú prísť firme);
 * - `prijata` + `odberatel` — firemný IBAN je na doklade ako účet odberateľa;
 * - `prijata` + `cudzi` — IBAN príjemcu platby nepatrí žiadnemu účtu firmy.
 *
 * Null = nedá sa povedať (vypnuté, bloček/iný doklad, firma nemá účty, na
 * doklade IBAN nie je).
 */
export type SmerPodlaIban =
  | { smer: "vystavena"; iban: string; ucet: UcetFirmy }
  | { smer: "prijata"; dovod: "odberatel"; iban: string; ucet: UcetFirmy }
  | { smer: "prijata"; dovod: "cudzi"; iban: string };

export function smerPodlaIban(args: {
  zapnute: boolean;
  druh: string | null | undefined;
  /** IBAN príjemcu platby (AI ho vyčíta ako IBAN dodávateľa). */
  ibanDokladu: string | null | undefined;
  /** IBAN odberateľa / platiteľa, ak je na doklade. */
  ibanOdberatela?: string | null;
  ucty: UcetFirmy[];
}): SmerPodlaIban | null {
  if (!args.zapnute || !args.ucty.length) return null;
  if (args.druh && !PRIJATE.has(args.druh)) return null;
  const vlastny = vlastnyUcetDokladu(args.ibanDokladu, args.ucty);
  if (vlastny) return { smer: "vystavena", iban: vlastny.iban, ucet: vlastny };
  const odberatel = vlastnyUcetDokladu(args.ibanOdberatela, args.ucty);
  if (odberatel)
    return { smer: "prijata", dovod: "odberatel", iban: odberatel.iban, ucet: odberatel };
  const iban = normalizujIban(args.ibanDokladu);
  if (iban.length >= 15 && /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban))
    return { smer: "prijata", dovod: "cudzi", iban: String(args.ibanDokladu).trim() };
  return null;
}
