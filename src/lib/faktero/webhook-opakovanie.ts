/**
 * Rozvrh opakovaného doručenia webhooku.
 *
 * Prvý pokus ide hneď pri udalosti. Keď prijímateľ neodpovie 2xx, skúša sa
 * znova s narastajúcim odstupom — výpadok na pár minút prekryjú prvé pokusy,
 * nočnú údržbu alebo víkendový výpadok tie posledné. Po poslednom pokuse
 * je doručenie „vzdané“ (stav `failed`) a majiteľ firmy to uvidí v zvončeku.
 *
 * Spolu 8 pokusov počas necelých dvoch dní.
 */

const MIN = 60_000;
const HOD = 60 * MIN;

/** Odstup po n-tom neúspešnom pokuse (index 0 = po prvom pokuse). */
export const ODSTUPY_OPAKOVANIA_MS = [
  1 * MIN,
  5 * MIN,
  30 * MIN,
  2 * HOD,
  6 * HOD,
  12 * HOD,
  24 * HOD,
] as const;

/** Prvý pokus + jedno opakovanie za každý odstup. */
export const MAX_POKUSOV_WEBHOOKU = ODSTUPY_OPAKOVANIA_MS.length + 1;

/**
 * Ako dlho drží rozbehnutý pokus zámok na riadku. Keď proces počas odoslania
 * spadne, cron riadok po tomto čase prevezme — príjemca ho môže dostať
 * dvakrát, preto nesie hlavičku `Idempotency-Key`.
 */
export const ZAMOK_POKUSU_MS = 5 * MIN;

/** Stavy záznamu doručenia. `failed` = vzdané, ďalej sa samo neopakuje. */
export type StavDorucenia = "pending" | "success" | "retrying" | "failed";

/**
 * Kedy skúsiť znova po `pokusov` neúspešných pokusoch; null = vzdať.
 */
export function dalsiPokusWebhooku(pokusov: number, teraz: Date): Date | null {
  if (!Number.isFinite(pokusov) || pokusov < 1) return new Date(teraz.getTime());
  if (pokusov >= MAX_POKUSOV_WEBHOOKU) return null;
  return new Date(teraz.getTime() + ODSTUPY_OPAKOVANIA_MS[pokusov - 1]!);
}

/** Stav a čas ďalšieho pokusu po neúspešnom pokuse číslo `pokusov`. */
export function poNeuspechu(
  pokusov: number,
  teraz: Date,
): { status: Extract<StavDorucenia, "retrying" | "failed">; next_attempt_at: string | null } {
  const dalsi = dalsiPokusWebhooku(pokusov, teraz);
  return dalsi
    ? { status: "retrying", next_attempt_at: dalsi.toISOString() }
    : { status: "failed", next_attempt_at: null };
}

/** HTTP odpoveď, ktorú berieme ako doručenú. */
export function jeDorucene(status: number | null | undefined): boolean {
  return typeof status === "number" && status >= 200 && status < 300;
}
