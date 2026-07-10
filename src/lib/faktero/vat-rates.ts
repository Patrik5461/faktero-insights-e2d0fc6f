// Slovak VAT rates valid from 1 Jan 2025 (§ 27 zákona č. 222/2004 Z. z.).
// 23% — základná, 19% — znížená, 5% — super-znížená, 0% — oslobodené.
// Historické sadzby (20%, 10%) musia ostať dostupné pre opravné doklady
// (dobropisy/ťarchopisy) k plneniam pred 1. 1. 2025.

export const SK_VAT_RATES = [23, 19, 5, 0] as const;
export const DEFAULT_VAT_RATE = 23;
export const LEGACY_SK_VAT_RATES = [20, 10] as const;

/**
 * Options shown in the VAT rate <select> for a given line.
 * Returns the current rates (23/19/5/0) plus the item's existing rate when
 * it is a legacy value — this preserves 20%/10% on historical invoices and
 * correction documents without offering them for brand-new items.
 */
export function vatRateOptions(currentRate?: number | null): number[] {
  const base = [...SK_VAT_RATES];
  const cur = currentRate == null ? null : Number(currentRate);
  if (cur != null && Number.isFinite(cur) && !base.includes(cur as (typeof SK_VAT_RATES)[number])) {
    return [...base, cur].sort((a, b) => b - a);
  }
  return base;
}
