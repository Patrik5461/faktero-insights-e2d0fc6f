/**
 * Poistka „neplatiteľ nesmie mať DPH“ (spúšťače `invoices_dph_neplatitela` a
 * `invoice_items_dph_neplatitela`) má výnimku pre import histórie
 * (SuperFaktúra, Pohoda/ISDOC, migrácia z Doklada): ten zapisuje servisným
 * kľúčom a nastaví `invoices.import_source`. Taký doklad môže DPH niesť —
 * spúšťač mu dá upozornenie do komentára a detail faktúry ukáže odznak.
 * Bežný používateľ si výnimku nezapne: `import_source` síce zapísať vie, ale
 * výnimka platí len mimo rolí authenticated/anon.
 */

/** Text, ktorý spúšťač pridá do `invoices.komentar` (musí sedieť s migráciou). */
export const UPOZORNENIE_IMPORT_DPH_NEPLATITELA =
  "Import: firma nie je platiteľ DPH, ale doklad zo zdroja nesie DPH. Skontrolujte ho.";

/** Importovaný doklad s DPH u firmy, ktorá nie je platiteľ — treba ho skontrolovať. */
export function importDphNeplatitela(
  inv: { import_source?: string | null; vat_total?: number | string | null } | null | undefined,
  firma: { vat_payer?: boolean | null } | null | undefined,
): boolean {
  if (!inv || !firma || firma.vat_payer !== false) return false;
  if (!String(inv.import_source ?? "").trim()) return false;
  const dan = Number(inv.vat_total ?? 0);
  return Number.isFinite(dan) && dan !== 0;
}
