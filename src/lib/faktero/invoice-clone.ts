/**
 * Increment "M/YYYY" occurrences by one month in a description string.
 * - "Konzultácie 3/2026" → "Konzultácie 4/2026"
 * - "Vícepráce 12/2025" → "Vícepráce 1/2026"
 * - "13/2026" (invalid month) → unchanged
 * - Strings without an M/YYYY token are returned unchanged.
 */
export function incrementMonthInText(input: string | null | undefined): string {
  if (!input) return input ?? "";
  return input.replace(/\b([1-9]|1[0-2])\/(\d{4})\b/g, (_m, mo, yr) => {
    const month = parseInt(mo, 10);
    const year = parseInt(yr, 10);
    if (month === 12) return `1/${year + 1}`;
    return `${month + 1}/${year}`;
  });
}
