/*
  Členenie DPH a členenie KV DPH v jednom zápise — „PD · B2“.

  Účtovníčka chce pri doklade vidieť obe naraz: členenie DPH (riadok
  priznania v Pohode) a členenie kontrolného výkazu (A1, B2, C1…). Doteraz
  zoznamy písali len členenie DPH a KV bolo vidno až v detaile.

  Čisté funkcie — berie ich zoznam, detail aj kompaktné rozloženie.
*/

const cisty = (v: unknown): string => String(v ?? "").trim();

/** „PD · B2“; chýbajúca časť vypadne, oboje prázdne → "". */
export function textClenenia(clenenie: unknown, kv: unknown): string {
  return [cisty(clenenie), cisty(kv)].filter(Boolean).join(" · ");
}

/** Predkontácia + „PD · B2“ — „501/321 · PD · B2“. */
export function textZauctovania(predkontacia: unknown, clenenie: unknown, kv: unknown): string {
  return [cisty(predkontacia), textClenenia(clenenie, kv)].filter(Boolean).join(" · ");
}
