/*
  Radenie dokladov v dávke pre účtovný program (voľba v okne exportu).
  Pohoda doklady číslujú v poradí, v akom ich dostane — radenie preto
  rozhoduje o poradí čísel v agende.
*/

export type RadenieExportu = "datum" | "cislo" | "nahratie";

export const RADENIA_EXPORTU: { kluc: RadenieExportu; nazov: string }[] = [
  { kluc: "datum", nazov: "Podľa dátumu dokladu" },
  { kluc: "cislo", nazov: "Podľa čísla dokladu" },
  { kluc: "nahratie", nazov: "Podľa poradia nahratia" },
];

const porovnajCisla = (a: string, b: string) =>
  a.localeCompare(b, "sk", { numeric: true, sensitivity: "base" });

/** Zoradí doklady (bločky aj prijaté faktúry) — nemení pôvodné pole. */
export function zoradNaExport<T extends Record<string, any>>(
  rows: T[],
  radenie?: RadenieExportu | null,
): T[] {
  if (!radenie) return rows;
  const datum = (r: T) => String(r.delivery_date || r.issue_date || "");
  const cislo = (r: T) => String(r.invoice_number ?? r.document_number ?? "");
  const vznik = (r: T) => String(r.created_at ?? "");
  return [...rows].sort((a, b) => {
    if (radenie === "cislo")
      return porovnajCisla(cislo(a), cislo(b)) || datum(a).localeCompare(datum(b));
    if (radenie === "nahratie")
      return vznik(a).localeCompare(vznik(b)) || porovnajCisla(cislo(a), cislo(b));
    return datum(a).localeCompare(datum(b)) || porovnajCisla(cislo(a), cislo(b));
  });
}
