/**
 * Admin → Využitie zdrojov: čisté výpočty (percentá, farby, odhad nákladov).
 * Bez serverového kódu — používa ho server aj stránka.
 */

export type LimitPlanu = {
  kluc: string;
  plan: string;
  nazov: string;
  jednotka: "bajty" | "pocet";
  /** Koľko plán zahŕňa (v bajtoch alebo kusoch). */
  zahrnute: number;
  /** Cena v USD za `za_mnozstvo` jednotiek nad limit. */
  cena_usd: number | null;
  za_mnozstvo: number;
  poznamka: string | null;
  zdroj: string;
  overene: string;
};

export type Ton = "zelena" | "oranzova" | "cervena";

/** Do 70 % zelená, 70–90 % oranžová, nad 90 % červená. */
export function tonPercent(pct: number): Ton {
  if (pct > 90) return "cervena";
  if (pct >= 70) return "oranzova";
  return "zelena";
}

export function percento(vyuzite: number, zahrnute: number): number | null {
  if (!Number.isFinite(vyuzite) || !Number.isFinite(zahrnute) || zahrnute <= 0) return null;
  return (vyuzite / zahrnute) * 100;
}

/**
 * Odhad ceny nad limit. `kurzUsd` je kurz ECB (1 EUR = kurz USD); bez neho sa
 * suma v eurách nepočíta (null), nič sa nevymýšľa.
 */
export function odhadNakladov(
  vyuzite: number,
  limit: Pick<LimitPlanu, "zahrnute" | "cena_usd" | "za_mnozstvo">,
  kurzUsd: number | null,
): { nad: number; usd: number; eur: number | null } | null {
  if (limit.cena_usd == null || !Number.isFinite(vyuzite)) return null;
  const nad = Math.max(0, vyuzite - limit.zahrnute);
  const mnozstvo = limit.za_mnozstvo > 0 ? limit.za_mnozstvo : 1;
  const usd = (nad / mnozstvo) * limit.cena_usd;
  const eur = kurzUsd && kurzUsd > 0 ? usd / kurzUsd : null;
  return { nad, usd, eur };
}

/** Dočasný kôš: `docasne` alebo `*-docasne`. */
export function jeDocasnyKos(nazov: string): boolean {
  return nazov === "docasne" || nazov.endsWith("-docasne");
}

/** Bajty v jednotkách, ktoré ukazuje dashboard Supabase (1 GB = 1024³ B). */
export function formatBajty(b: number | null | undefined): string {
  if (b == null || !Number.isFinite(b)) return "—";
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
