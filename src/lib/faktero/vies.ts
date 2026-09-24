/**
 * IČ DPH z iného členského štátu.
 *
 * Pri dodaní tovaru do EÚ je platné IČ DPH odberateľa podmienkou oslobodenia
 * od dane, nie formalitou — od roku 2020 to hovorí zákon výslovne. Overuje sa
 * v registri VIES, ktorý prevádzkuje Európska komisia.
 */

/** Kódy štátov, ktoré VIES pozná. Severné Írsko má vlastný kód XI. */
export const KRAJINY_EU = [
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "EL",
  "ES",
  "FI",
  "FR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
  "XI",
] as const;

export type KrajinaEu = (typeof KRAJINY_EU)[number];

/** Grécko má v IČ DPH kód EL, hoci kód krajiny je GR. */
function opravKod(kod: string): string {
  return kod === "GR" ? "EL" : kod;
}

export function upravIcDph(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/[\s.\-/]/g, "")
    .toUpperCase();
}

export function rozdelIcDph(v: string | null | undefined): { kod: string; cislo: string } | null {
  const s = upravIcDph(v);
  const m = s.match(/^([A-Z]{2})([0-9A-Z]{2,13})$/);
  if (!m) return null;
  return { kod: opravKod(m[1]), cislo: m[2] };
}

export function jeEuIcDph(v: string | null | undefined): boolean {
  const r = rozdelIcDph(v);
  return Boolean(r && (KRAJINY_EU as readonly string[]).includes(r.kod));
}

/** Slovenské IČ DPH sa vo VIES overiť dá, ale pri dodaní do EÚ nedáva zmysel. */
export function jeTuzemske(v: string | null | undefined): boolean {
  return rozdelIcDph(v)?.kod === "SK";
}

export type VysledokVies = {
  platne: boolean;
  nazov?: string | null;
  adresa?: string | null;
  potvrdenie?: string | null;
  chyba?: string | null;
  overene: string;
};

/** Odpoveď VIES na tvar, ktorý sa ukladá. Prázdne polia chodia ako „---". */
export function vysledokZOdpovede(o: any): VysledokVies {
  const ocisti = (v: unknown) => {
    const s = String(v ?? "").trim();
    return !s || s === "---" ? null : s;
  };
  const adresa = ocisti(o?.address);
  return {
    platne: Boolean(o?.isValid),
    nazov: ocisti(o?.name),
    adresa: adresa ? adresa.replace(/\s*\n\s*/g, ", ") : null,
    potvrdenie: ocisti(o?.requestIdentifier),
    chyba: ocisti(o?.userError) === "VALID" ? null : ocisti(o?.userError),
    overene: String(o?.requestDate ?? new Date().toISOString()),
  };
}

/** Koľko dní je overenie „čerstvé". Pri dodaní do EÚ sa overuje ku každému dodaniu. */
export const PLATNOST_DNI = 30;

export function jeCerstve(overene: string | null | undefined, dnes = new Date()): boolean {
  if (!overene) return false;
  const t = new Date(overene).getTime();
  if (!Number.isFinite(t)) return false;
  return (dnes.getTime() - t) / 86_400_000 <= PLATNOST_DNI;
}
