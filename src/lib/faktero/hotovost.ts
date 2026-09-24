/**
 * Pravidlá pre platby v hotovosti.
 *
 * Dve veci, ktoré program musí ustrážiť sám:
 *  - celková cena platená v hotovosti sa zaokrúhľuje na päť centov (§ 3 ods. 4
 *    zákona č. 18/1996 Z. z. o cenách, od 1. 7. 2022), lebo jedno- a dvojcentové
 *    mince sa už nevydávajú,
 *  - platba v hotovosti nad 5 000 eur medzi podnikateľmi je zakázaná (zákon
 *    č. 394/2012 Z. z.).
 */

/** Zákonný strop platby v hotovosti medzi podnikateľmi. */
export const STROP_HOTOVOSTI = 5000;

/** Medzi fyzickými osobami mimo podnikania je strop vyšší. */
export const STROP_HOTOVOSTI_OBCAN = 15000;

export function jeHotovost(sposob: string | null | undefined): boolean {
  const s = String(sposob ?? "").toLowerCase();
  return s === "cash" || s === "hotovost" || s === "hotovosť";
}

/** Zaokrúhlenie na najbližších päť centov — matematicky, teda 2,52 aj 2,53 na 2,55. */
export function zaokruhliNaPatCentov(suma: number): number {
  const n = Number(suma);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 20) / 20;
}

/** Rozdiel, ktorý zaokrúhlenie spôsobí — na doklade sa uvádza samostatne. */
export function rozdielZaokruhlenia(suma: number): number {
  return Math.round((zaokruhliNaPatCentov(suma) - Number(suma)) * 100) / 100;
}

/** Prekročený zákonný strop? Vracia text upozornenia, inak null. */
export function prekrocenyStrop(suma: number, sposob: string | null | undefined): string | null {
  if (!jeHotovost(sposob)) return null;
  if (Number(suma) <= STROP_HOTOVOSTI) return null;
  return `Platba v hotovosti nad ${STROP_HOTOVOSTI.toLocaleString("sk-SK")} € je medzi podnikateľmi zakázaná (zákon č. 394/2012 Z. z.). Medzi fyzickými osobami mimo podnikania je strop ${STROP_HOTOVOSTI_OBCAN.toLocaleString("sk-SK")} €.`;
}
