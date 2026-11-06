/*
  Doklad „na kontrolu“ kvôli rozpisu DPH (audit 6. 11. 2026).

  Oprava rozpisu DPH (`oprava-rozpisu-dph`) a vyťaženie označia prijatú
  faktúru či bloček príznakom `na_kontrolu_at` s dôvodom, ktorý začína
  „Rozpis DPH“ — rozpis nesedí so sumou dokladu alebo vychádza mimo platných
  sadzieb. Taký doklad nesmie odísť do Pohody ani sa zaúčtovať autopilotom,
  kým ho človek neskontroluje: Tempus-Car 40260037 by inak priniesol odpočet
  ~3 400 € navyše.

  Pustí ho:
   - tlačidlo „Skontrolované“ / „Pokračovať aj tak“ (`ulozPotvrdenieRozpisu`)
     zruší `na_kontrolu_at`,
   - alebo potvrdenie rozpisu (`rozpis_dph_potvrdeny.at`) novšie než príznak.

  Príznak eFaktúry automaticky zaradenej do firmy (`na_kontrolu_dovod`
  prázdny) sa netýka DPH — ten doklad nezastaví.
*/

/** Text prekážky — rovnaký v kontrole pred exportom, v exporte aj v autopilotovi. */
export const DOVOD_ROZPIS_NA_KONTROLE = "Rozpis DPH je na kontrole — skontrolujte ho a potvrďte";

type Riadok = Record<string, any> | null | undefined;

/** Dôvod príznaku patrí rozpisu DPH (nie eFaktúre zaradenej do firmy). */
export function jeDovodRozpisu(dovod: unknown): boolean {
  return /^\s*Rozpis DPH/i.test(String(dovod ?? ""));
}

/**
 * Riadok `purchase_invoices` / `expense_documents` čaká na kontrolu rozpisu
 * DPH a človek ho ešte nepotvrdil.
 */
export function jeRozpisNaKontrole(row: Riadok): boolean {
  if (!row?.na_kontrolu_at || !jeDovodRozpisu(row.na_kontrolu_dovod)) return false;
  const potvrdene = row.rozpis_dph_potvrdeny;
  const at = potvrdene && typeof potvrdene === "object" ? (potvrdene as { at?: unknown }).at : null;
  if (at) {
    const tPotvrdenia = Date.parse(String(at));
    const tPriznaku = Date.parse(String(row.na_kontrolu_at));
    if (Number.isFinite(tPotvrdenia) && (!Number.isFinite(tPriznaku) || tPotvrdenia >= tPriznaku))
      return false;
  }
  return true;
}
