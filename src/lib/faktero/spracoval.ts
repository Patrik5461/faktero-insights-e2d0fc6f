/*
  Kto doklad spracoval (ako stĺpec „Spracoval“ v Doklado) a kto ho nahral.

  Spracoval = kto doklad vytvoril z Nespracovaných dokladov (klikol Vytvoriť):
  prijatá faktúra `spracoval` / `spracovane_at`, bloček `processed_by` /
  `processed_at`. `created_by` je niečo iné — ten, kto doklad nahral, pri
  maile majiteľ adresy dokladov.
*/

export type Spracovanie = { kto: string | null; kedy: string | null };

/** Údaj o spracovaní z riadka dokladu (null = nespracovaný alebo bez údaja). */
export function spracovanieDokladu(
  r: Record<string, any> | null | undefined,
  agenda: "prijata" | "doklad",
): Spracovanie | null {
  if (!r) return null;
  const kto = (agenda === "prijata" ? r.spracoval : r.processed_by) ?? null;
  const kedy = (agenda === "prijata" ? r.spracovane_at : r.processed_at) ?? null;
  if (!kto && !kedy) return null;
  return { kto: kto ? String(kto) : null, kedy: kedy ? String(kedy) : null };
}

/** Meno toho, kto doklad spracoval; neznámy člen (odišiel z firmy) = null. */
export function menoSpracovatela(
  s: Spracovanie | null,
  mena: Record<string, string>,
): string | null {
  if (!s?.kto) return null;
  return mena[s.kto] ?? null;
}

/**
 * Kto doklad nahral — meno kolegu pri nahratí na webe či v appke. Pri maile
 * (a API) je v `created_by` majiteľ adresy, nie odosielateľ — meno by
 * klamalo, preto vtedy null a ukáže sa len zdroj.
 */
export function nahralDokladu(
  zdroj: string | null | undefined,
  createdBy: string | null | undefined,
  mena: Record<string, string>,
): string | null {
  if (!createdBy || zdroj === "mail" || zdroj === "api") return null;
  return mena[createdBy] ?? null;
}
