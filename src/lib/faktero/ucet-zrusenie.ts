/**
 * Zrušenie účtu — počítanie lehoty.
 *
 * Oddelené od servera aj od stránky, nech sa dá odskúšať: termín a zostávajúce
 * dni sú jediné miesto, kde sa dá pomýliť tak, že si to nikto nevšimne.
 */

/** Koľko dní má človek na to, aby si to rozmyslel. */
export const ODKLAD_DNI = 14;

/** Termín zrušenia z okamihu žiadosti. */
export function terminZrusenia(od: Date = new Date()): Date {
  return new Date(od.getTime() + ODKLAD_DNI * 24 * 60 * 60 * 1000);
}

/**
 * Koľko dní ostáva. Zaokrúhľuje sa nahor — kým z lehoty ostáva čo len hodina,
 * je to „ešte 1 deň", nie nula.
 */
export function dniDoZrusenia(termin: string | Date, teraz: Date = new Date()): number {
  const t = typeof termin === "string" ? new Date(termin) : termin;
  const ms = t.getTime() - teraz.getTime();
  if (!Number.isFinite(ms)) return 0;
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/** Nastal už termín? Rozhoduje o tom, či sa účet ruší. */
export function jeNaZrusenie(termin: string | null | undefined, teraz: Date = new Date()): boolean {
  if (!termin) return false;
  const t = new Date(termin).getTime();
  return Number.isFinite(t) && t <= teraz.getTime();
}

/** „14. augusta 2026" — do vety, nie do tabuľky. */
export function terminSlovom(termin: string | Date, locale = "sk-SK"): string {
  const t = typeof termin === "string" ? new Date(termin) : termin;
  return t.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}
