/**
 * Položky opakovanej šablóny pred uložením — rovnaké pravidlá ako pri novej
 * šablóne a pri vystavení faktúry: riadok bez názvu aj bez sumy je len
 * prázdne miesto vo formulári a do šablóny nepatrí; riadok so sumou bez
 * názvu je chyba (inak by sa do každej vystavenej faktúry dostal bezmenný riadok).
 */
export type PolozkaSablony = {
  name: string;
  unit_price: number | string;
};

export function platnePolozkySablony<T extends PolozkaSablony>(
  polozky: T[],
): { riadky: T[]; chyba: string | null } {
  const riadky = polozky.filter(
    (it) => String(it.name ?? "").trim() !== "" || Number(it.unit_price) !== 0,
  );
  const bezNazvu = riadky.find((it) => !String(it.name ?? "").trim());
  return { riadky, chyba: bezNazvu ? "Položka so sumou musí mať názov." : null };
}
