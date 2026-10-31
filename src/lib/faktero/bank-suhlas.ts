/**
 * Platnosť súhlasu Tatra banky — kedy upozorniť, že sa blíži koniec.
 *
 * Banka pri udelení súhlasu vydá prístupový token s platnosťou 180 dní
 * (`expires_in`), a to je zároveň lehota, po ktorej si PSD2 pýta nové
 * prihlásenie. `GET /v3/consents/{id}` dátum konca nevracia (len
 * `consentStatus` a `lastActionDate`), takže jediný údaj, ktorý máme, je
 * `bank_connections.token_expires_at` — overené 2026-10-31: súhlas PALIERY
 * má `lastActionDate` 2026-08-07 a token platí do 2027-02-03, presne 180 dní.
 *
 * Bez upozornenia sa koniec súhlasu prejaví až tak, že pohyby prestanú
 * chodiť a párovanie platieb potichu stojí.
 */

/** Koľko dní vopred sa súhlas začne ukazovať vo zvončeku a na karte banky. */
export const UPOZORNIT_DNI = 14;

/** Pri ktorých hraniciach ide e-mail — každá raz. */
export const PRAHY_EMAILU = [14, 3] as const;

export type StavSuhlasu = {
  stav: "ok" | "blizi" | "vyprsal";
  /** Celé dni do konca (záporné = po konci). */
  dni: number;
  /** Deň konca ako YYYY-MM-DD (bratislavský čas). */
  platiDo: string;
};

const DEN_MS = 86_400_000;

function denVBratislave(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(d);
}

/**
 * Stav súhlasu podľa konca platnosti tokenu. `null`, keď koniec nepoznáme —
 * vtedy sa nič neukazuje, lebo by sme si dátum vymysleli.
 */
export function stavSuhlasu(
  platiDo: string | null | undefined,
  teraz: Date = new Date(),
): StavSuhlasu | null {
  if (!platiDo) return null;
  const koniec = Date.parse(platiDo);
  if (!Number.isFinite(koniec)) return null;
  const den = denVBratislave(new Date(koniec));
  // Počíta sa po kalendárnych dňoch, nech „o 1 deň“ znamená zajtra, nie o 24 hodín.
  const dni = Math.round(
    (Date.parse(`${den}T00:00:00Z`) - Date.parse(`${denVBratislave(teraz)}T00:00:00Z`)) / DEN_MS,
  );
  const stav = koniec <= teraz.getTime() ? "vyprsal" : dni <= UPOZORNIT_DNI ? "blizi" : "ok";
  return { stav, dni, platiDo: den };
}

/**
 * Ktorý e-mail o súhlase patrí k danému stavu: `vyprsal`, alebo najbližšia
 * hranica z `PRAHY_EMAILU`, ktorú už súhlas prekročil. Dedup podľa
 * (pripojenie, druh, deň konca) zaistí, že každý odíde raz — aj keď cron
 * jeden deň vynechá, dobehne sa najbližšia hranica, nie všetky naraz.
 */
export function druhEmailuSuhlasu(s: StavSuhlasu | null): string | null {
  if (!s || s.stav === "ok") return null;
  if (s.stav === "vyprsal") return "suhlas_vyprsal";
  let prah: number | null = null;
  for (const p of PRAHY_EMAILU) if (s.dni <= p) prah = p;
  return prah === null ? null : `suhlas_${prah}`;
}

/** Ľudský dátum z YYYY-MM-DD. */
export function datumSuhlasu(den: string): string {
  const [r, m, d] = den.split("-");
  return `${Number(d)}. ${Number(m)}. ${r}`;
}
