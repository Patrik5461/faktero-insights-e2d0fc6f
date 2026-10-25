/**
 * Faktúra, ktorá už odišla ako eFaktúra z Faktera, sa nesmie poslať cez Peppol
 * znova z Pohody — POHODA to od verzie Jeseň 2026 vie a účtovníčka by ju po
 * importe mohla odoslať druhýkrát. Preto sa to dopíše do internej poznámky
 * dokladu v XML pre Pohodu a ukáže sa to aj pri exporte.
 */
export function intNoteSEfakturou(
  intPoznamka: string | null | undefined,
  odoslana: string | null | undefined,
): string {
  const povodna = String(intPoznamka ?? "").trim();
  if (!odoslana) return povodna;
  const d = odoslana.slice(0, 10).split("-").reverse().join(". ");
  const veta = `Odoslané ako eFaktúra z Faktera ${d} — cez Peppol znova neposielať.`;
  return povodna ? `${veta} ${povodna}` : veta;
}

type Dorucenie = { document_id: string; status: string | null; created_at: string };

/** Kedy faktúra odišla ako eFaktúra (prvé neodmietnuté odoslanie), podľa id faktúry. */
export function prveOdoslanie(
  dokumenty: { id: string; invoice_id: string | null }[],
  dorucenia: Dorucenie[],
): Record<string, string> {
  const faktura = new Map(dokumenty.filter((d) => d.invoice_id).map((d) => [d.id, d.invoice_id!]));
  const out: Record<string, string> = {};
  for (const d of [...dorucenia].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const id = faktura.get(d.document_id);
    if (!id || out[id]) continue;
    if (["failed", "error", "rejected"].includes(String(d.status))) continue;
    out[id] = d.created_at;
  }
  return out;
}
