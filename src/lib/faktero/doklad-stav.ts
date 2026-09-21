/*
  Stavy dokladu tak, ako ich vidí človek.

  Každý doklad — z appky, z webu aj zo starej verzie appky — sa uloží ako
  nespracovaný (`new`). Spracovaným ho urobí až niekto, kto ho skontroloval,
  zvyčajne účtovník. Odovzdaný (`exported`) je doklad, ktorý už odišiel do
  účtovníctva balíkom alebo cez most do Pohody.
*/

export type StavDokladu = "new" | "processed" | "exported";

export const STAV_DOKLADU_NAZOV: Record<StavDokladu, string> = {
  new: "Nespracovaný",
  processed: "Spracovaný",
  exported: "Odovzdaný",
};

/** Záložky v zozname a ich hodnota v adrese (`/doklady?stav=…`). */
export const ZALOZKY_DOKLADOV = [
  { kluc: "nespracovane", nazov: "Nespracované", stav: "new" },
  { kluc: "spracovane", nazov: "Spracované", stav: "processed" },
  { kluc: "odovzdane", nazov: "Odovzdané účtovníkovi", stav: "exported" },
  { kluc: "vsetky", nazov: "Všetky", stav: "all" },
] as const;

export type ZalozkaDokladov = (typeof ZALOZKY_DOKLADOV)[number]["kluc"];

export function jeZalozkaDokladov(v: unknown): v is ZalozkaDokladov {
  return ZALOZKY_DOKLADOV.some((z) => z.kluc === v);
}

type DokladNaKontrolu = {
  total_amount?: number | string | null;
  issue_date?: string | null;
  supplier_name?: string | null;
};

/**
 * Čo na doklade chýba — ukazuje sa v zozname, nech je hneď vidieť bloček,
 * ktorý appka neprečítala (napríklad nafotený bez signálu).
 */
export function chybajuceUdaje(d: DokladNaKontrolu): string[] {
  const chyba: string[] = [];
  if (d.total_amount == null || d.total_amount === "") chyba.push("suma");
  if (!d.issue_date) chyba.push("dátum");
  if (!d.supplier_name?.trim()) chyba.push("dodávateľ");
  return chyba;
}

/**
 * Spracovaný doklad musí mať aspoň sumu a dátum — bez nich sa nedá zaúčtovať.
 * Dodávateľ chýbať smie: na parkovacom lístku či bločku z automatu nebýva.
 */
export function daSaSpracovat(d: DokladNaKontrolu): boolean {
  const chyba = chybajuceUdaje(d);
  return !chyba.includes("suma") && !chyba.includes("dátum");
}
