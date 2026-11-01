/**
 * Pomôcky inventúry — čisté funkcie, aby sa dali otestovať.
 */
import { cisloZImportu } from "./sklad-import";

type RiadokInventury = { counted_quantity?: unknown; expected_quantity?: unknown };

/**
 * Koľko úprav stavu vytvorí ukončenie inventúry — riadky, kde je spočítané
 * a líši sa od očakávaného. Rovnaké pravidlo ako `completeInventory`.
 */
export function pocetRozdielov(riadky: RiadokInventury[]): number {
  return riadky.filter((r) => {
    if (r.counted_quantity == null || r.counted_quantity === "") return false;
    const rozdiel = Number(r.counted_quantity) - Number(r.expected_quantity ?? 0);
    return Number.isFinite(rozdiel) && Math.abs(rozdiel) > 1e-9;
  }).length;
}

/**
 * Hodnota z poľa „Spočítané“. `zmena: false`, keď sa nič nezmenilo — vtedy sa
 * neukladá (opustenie poľa po skene predtým prepísalo naskenovaný počet
 * starou hodnotou). Neplatný text vráti `chyba: true`.
 */
export function spocitaneZPola(
  povodne: unknown,
  text: string,
): { zmena: boolean; hodnota: number | null; chyba?: boolean } {
  const n = cisloZImportu(text);
  if (n !== null && Number.isNaN(n)) return { zmena: false, hodnota: null, chyba: true };
  const stare = povodne == null || povodne === "" ? null : Number(povodne);
  if (n === stare) return { zmena: false, hodnota: n };
  return { zmena: true, hodnota: n };
}
