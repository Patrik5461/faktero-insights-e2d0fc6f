/**
 * Dobropis sa ukazuje s kladnými sumami.
 *
 * V databáze je dobropis (`type = 'credit_note'`) uložený so zápornými
 * sumami a záporným množstvom — tak s ním počítajú súčty, výkazy DPH,
 * exporty, párovanie aj eFaktúra (`znamienkoDokladu` v `faktury-sumy`).
 * To sa nemení. Mení sa len to, čo vidí človek: PDF, zoznam, detail,
 * formulár, e-mail a verejná stránka dokladu. Že ide o zníženie, hovorí
 * nadpis „Dobropis“, nie mínus pri každej sume.
 *
 * Neotáča sa naslepo absolútnou hodnotou: v zápornom dobropise môže byť aj
 * kladný riadok (napr. manipulačný poplatok), ten po otočení ostane s mínusom,
 * aby bolo vidieť, že dobropis zmenšuje.
 *
 * Výnimky:
 *  - starší import uložil dobropis kladne — ten sa ukazuje tak, ako je;
 *  - opravný doklad podľa § 25a (`oprava_25a`) je síce `credit_note`, ale
 *    býva záporný (zníženie základu) aj kladný (vrátenie po zaplatení) —
 *    znamienko je tam informácia, preto ostáva;
 *  - ťarchopis (`debit_note`) je kladný a nemení sa.
 */

export type DokladZnamienko = {
  type?: string | null;
  total?: unknown;
  oprava_25a?: boolean | null;
};

/** −1, keď sa sumy dokladu majú na zobrazenie otočiť, inak 1. */
export function znamienkoZobrazenia(d: DokladZnamienko | null | undefined): 1 | -1 {
  if (!d || d.type !== "credit_note" || d.oprava_25a) return 1;
  return Number(d.total) < 0 ? -1 : 1;
}

/** Je to dobropis (nie § 25a), ktorý sa ukazuje kladne? */
export function jeDobropisNaZobrazenie(d: DokladZnamienko | null | undefined): boolean {
  return !!d && d.type === "credit_note" && !d.oprava_25a;
}

/** Suma dokladu tak, ako ju má vidieť človek (bez „−0“). */
export function sumaNaZobrazenie(d: DokladZnamienko | null | undefined, suma: unknown): number {
  const v = znamienkoZobrazenia(d) * Number(suma ?? 0);
  return v || 0;
}

const SUMY_HLAVICKY = [
  "subtotal",
  "vat_total",
  "total",
  "subtotal_eur",
  "vat_total_eur",
  "total_eur",
] as const;

/**
 * Kópia hlavičky dokladu so sumami na zobrazenie. Pôvodný objekt sa nemení —
 * PDF z neho potom ešte skladá ZUGFeRD, ktorý znamienka potrebuje.
 */
export function dokladNaZobrazenie<T extends Record<string, any>>(d: T): T {
  if (znamienkoZobrazenia(d) === 1) return d;
  const out: Record<string, any> = { ...d };
  for (const k of SUMY_HLAVICKY)
    if (out[k] != null && out[k] !== "") out[k] = sumaNaZobrazenie(d, out[k]);
  return out as T;
}

/**
 * Riadok dokladu na zobrazenie. Otočí sa súčet riadku a to z množstva a
 * ceny, čo nesie mínus — formulár dáva mínus do množstva, ručne zadaný
 * starší dobropis ho mohol mať v cene.
 */
export function polozkaNaZobrazenie<T extends Record<string, any>>(
  d: DokladZnamienko | null | undefined,
  it: T,
): T {
  if (znamienkoZobrazenia(d) === 1) return it;
  const otoc = (v: unknown) => (v == null || v === "" ? v : -Number(v) || 0);
  const out: Record<string, any> = { ...it };
  for (const k of ["subtotal", "vat_amount", "total"]) if (k in out) out[k] = otoc(out[k]);
  if (Number(it.quantity) < 0 || !(Number(it.unit_price) < 0)) out.quantity = otoc(it.quantity);
  else out.unit_price = otoc(it.unit_price);
  return out as T;
}

/* ── Formulár ─────────────────────────────────────────────────────────── */

/**
 * Znamienko množstva vo formulári dobropisu. Človek zadáva množstvá a ceny
 * kladne; pri zápise sa množstvo otočí, takže v databáze vznikne presne to,
 * čo predtým (záporné množstvo, kladná cena).
 *
 * `ulozeny` je doklad načítaný na úpravu: starší kladne uložený dobropis a
 * § 25a sa neotáčajú, aby sa uložením nezmenili.
 */
export function znamienkoFormulara(
  typ: string | null | undefined,
  ulozeny?: DokladZnamienko | null,
): 1 | -1 {
  if (typ !== "credit_note") return 1;
  if (ulozeny?.oprava_25a) return 1;
  if (ulozeny && Number(ulozeny.total) > 0) return 1;
  return -1;
}

/** Riadky z formulára do databázy (a naopak — otočenie je samo sebe inverzné). */
export function riadkyNaZapis<T extends { quantity: number }>(riadky: T[], znamienko: 1 | -1): T[] {
  if (znamienko === 1) return riadky;
  return riadky.map((r) => ({ ...r, quantity: -Number(r.quantity) || 0 }));
}

/** Suma z formulára na zobrazenie (súčty sa počítajú z riadkov na zápis). */
export function sumaFormulara(suma: number, znamienko: 1 | -1): number {
  return znamienko * suma || 0;
}
