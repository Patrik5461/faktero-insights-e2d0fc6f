/**
 * Slovenské množné číslo: 1 faktúra, 2–4 faktúry, 5+ faktúr.
 *
 * „1 faktúr" alebo „2 položiek" vyzerá ako chyba programu, aj keď ide len o
 * text. Rovnaké pravidlo platí aj pre záporné čísla (−1 faktúra) a pre nulu,
 * ktorá berie tvar piatich a viac.
 */
export function mnozne(pocet: number, tvary: [string, string, string]): string {
  const n = Math.abs(Math.trunc(Number(pocet) || 0));
  if (n === 1) return tvary[0];
  if (n >= 2 && n <= 4) return tvary[1];
  return tvary[2];
}

/** Číslo aj s tvarom — „3 položky". */
export function sPoctom(pocet: number, tvary: [string, string, string]): string {
  return `${pocet} ${mnozne(pocet, tvary)}`;
}

export const FAKTURY: [string, string, string] = ["faktúra", "faktúry", "faktúr"];
export const POLOZKY: [string, string, string] = ["položka", "položky", "položiek"];
export const ODBERATELIA: [string, string, string] = ["odberateľ", "odberatelia", "odberateľov"];
