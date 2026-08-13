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
/**
 * Prilepí dopočítanú sadzbu k najbližšej platnej alebo historickej sadzbe.
 * Prijaté faktúry majú uložený len základ a daň; podiel preto kvôli
 * zaokrúhľovaniu na centy vyjde napr. 22,97 % namiesto 23 %. Tolerancia je
 * 0,5 percentuálneho bodu — dosť na zaokrúhlenie, málo na zámenu 19 a 23.
 */
export function najblizsiaSadzba(vypocitana: number): number {
  const n = Number(vypocitana);
  if (!Number.isFinite(n)) return 0;
  const znama = [...SK_VAT_RATES, ...LEGACY_SK_VAT_RATES].find((r) => Math.abs(r - n) <= 0.5);
  return znama ?? Math.round(n * 100) / 100;
}

export function vatBucketKey(rate: number | null | undefined): string {
  // `Number(null)` je 0, takže bez tejto kontroly by sa neznáma sadzba tvárila
  // ako nulová — a to sú v priznaní dva rôzne riadky.
  if (rate == null) return "exempt";
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0) return "exempt";
  // Zdanené plnenie nesmie nikdy skončiť medzi oslobodenými — aj neznámu alebo
  // historickú sadzbu preto dostane vlastný riadok. Inak by sa 19 % a 20 %
  // (opravné doklady k plneniam spred 2025) ticho spadli medzi oslobodené
  // plnenia a súčty v priznaní by nesedeli.
  return String(n);
}

/**
 * Poradie riadkov v prehľade DPH: najprv platné sadzby, potom sadzby, ktoré sa
 * naozaj vyskytli v dátach (historické 20/10 alebo zahraničné), a nakoniec
 * oslobodené plnenia a prenos daňovej povinnosti.
 */
export function vatBucketOrder(seenKeys: Iterable<string>): string[] {
  const zaklad = SK_VAT_RATES.map(String);
  const navyse = [...new Set(seenKeys)]
    .filter((k) => k !== "exempt" && k !== "pdp" && !zaklad.includes(k))
    .sort((a, b) => Number(b) - Number(a));
  return [...zaklad, ...navyse, "exempt", "pdp"];
}

export function vatBucketLabel(key: string): string {
  if (key === "exempt") return "Oslobodené";
  if (key === "pdp") return "PDP (prenos daňovej povinnosti)";
  const n = Number(key);
  if (n === 23) return "23 % (základná)";
  if (n === 19 || n === 5) return `${n} % (znížená)`;
  if (n === 0) return "0 % (nulová)";
  return `${n} % (historická)`;
}

export function vatRateOptions(currentRate?: number | null): number[] {
  const base = [...SK_VAT_RATES];
  const cur = currentRate == null ? null : Number(currentRate);
  if (cur != null && Number.isFinite(cur) && !base.includes(cur as (typeof SK_VAT_RATES)[number])) {
    return [...base, cur].sort((a, b) => b - a);
  }
  return base;
}
