/*
  Položky novej cenovej ponuky pred uložením (D-06). Prázdny riadok (bez názvu
  aj bez ceny) do ponuky nepatrí — rovnako ako na faktúre a v opakovanej
  faktúre. Riadok so sumou bez názvu je chyba, ktorú treba ukázať ešte pred
  pridelením čísla, inak by číslo z radu prepadlo a ponuka ostala bez položiek.
*/

export type RiadokPonuky = { name?: string | null; unit_price?: unknown; quantity?: unknown };

export function kontrolaPoloziekPonuky<T extends RiadokPonuky>(
  polozky: readonly T[],
): { riadky: T[]; chyba: string | null } {
  const riadky = polozky.filter(
    (p) => String(p.name ?? "").trim() !== "" || Number(p.unit_price ?? 0) !== 0,
  );
  if (riadky.some((p) => !String(p.name ?? "").trim()))
    return { riadky, chyba: "Položka so sumou musí mať názov." };
  if (!riadky.length) return { riadky, chyba: "Ponuka musí mať aspoň jednu položku." };
  return { riadky, chyba: null };
}
