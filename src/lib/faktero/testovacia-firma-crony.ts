/*
  Čistá logika vylúčenia testovacích firiem v cronoch, admine a pri zrušení
  účtu (bez DB, aby sa dala skúšať). Serverové stráže sú v
  testovacia-firma.server.ts.
*/

/** Riadok, ktorý nesie (napr. cez vnorené `companies(...)`) príznak testovacej firmy. */
type SVnorenouFirmou = {
  companies?: { testovacia_pre?: string | null } | null;
};

/** Je vnorená firma riadku testovacia? (`subscriptions` → `companies(testovacia_pre)`) */
export function vnorenaJeTestovacia(r: SVnorenouFirmou): boolean {
  return !!r.companies?.testovacia_pre;
}

/** Riadky bez tých, ktoré patria testovacej firme (podľa vnorenej `companies`). */
export function bezVnorenychTestovacich<T extends SVnorenouFirmou>(riadky: readonly T[]): T[] {
  return riadky.filter((r) => !vnorenaJeTestovacia(r));
}

/** Riadky bez tých, ktorých firma je v množine testovacích (z `testovacieZoZoznamu`). */
export function bezTestovacich<T>(
  riadky: readonly T[],
  testovacie: ReadonlySet<string>,
  firma: (r: T) => string | null | undefined,
): T[] {
  if (!testovacie.size) return [...riadky];
  return riadky.filter((r) => {
    const id = firma(r);
    return !id || !testovacie.has(id);
  });
}

/** Firma z pohľadu zrušenia účtu. */
export type FirmaClena = {
  id: string;
  /** Koľko členov firma má (vrátane rušeného človeka). */
  clenov: number;
  /** Id skutočnej firmy, ak je táto testovacia; inak null. */
  testovacia_pre: string | null;
};

/**
 * Ktoré firmy sa pri zrušení účtu mažú: tie, kde bol človek jediným členom.
 * Testovacie firmy sa samostatne nemažú — zmaže ich `faktero_zmaz_firmu`
 * spolu s rodičom (a keď rodič ostáva, ostáva aj jeho testovacia firma;
 * jej členov zrkadlí spúšťač z rodiča).
 */
export function firmyNaZmazanieUctu(firmy: readonly FirmaClena[]): string[] {
  return firmy.filter((f) => f.clenov <= 1 && !f.testovacia_pre).map((f) => f.id);
}
