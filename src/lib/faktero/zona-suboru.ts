/**
 * Pustený súbor (drag & drop) obchádza `accept` na `<input type=file>` —
 * prehliadač prepustí čokoľvek. Kontrola prípony preto ide ručne.
 *
 * `accept` je zoznam ako v HTML („.xml,.csv,application/zip“); typy MIME
 * a zástupné „image/*“ sa porovnávajú s `file.type`.
 */
export function suborSediSAccept(
  subor: { name: string; type?: string },
  accept: string | null | undefined,
): boolean {
  const polozky = (accept ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!polozky.length) return true;
  const meno = subor.name.toLowerCase();
  const typ = (subor.type ?? "").toLowerCase();
  return polozky.some((p) => {
    if (p.startsWith(".")) return meno.endsWith(p);
    if (p.endsWith("/*")) return typ.startsWith(p.slice(0, -1));
    return typ === p;
  });
}
