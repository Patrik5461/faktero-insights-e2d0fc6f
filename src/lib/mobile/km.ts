/**
 * Kilometre na obrazovke podľa jazyka appky.
 *
 * `toFixed(1)` písal všade desatinnú bodku („0.96 km“), hoci appka inak
 * formátuje čísla podľa jazyka — po slovensky, česky aj nemecky má byť čiarka.
 */
export function kilometre(v: number | string | null | undefined, loc: string, desatin = 1): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat(loc, {
    minimumFractionDigits: desatin,
    maximumFractionDigits: desatin,
  }).format(Number.isFinite(n) ? n : 0);
}
