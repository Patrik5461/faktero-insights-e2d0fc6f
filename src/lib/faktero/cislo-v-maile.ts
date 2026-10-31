/*
  Číslo faktúry v predmete a texte mailu.

  Okno „Odoslať e-mailom“ predvyplní predmet aj text s číslom faktúry, aké
  bolo pri jeho otvorení. Keby sa číslo medzitým zmenilo (oprava čísla na
  druhej karte, faktúra z telefónu bez signálu, ktorej rezervácia prepadla),
  odišiel by mail s iným číslom, než nesie priložené PDF. Server preto pri
  odoslaní nahradí číslo z okna aktuálnym číslom z databázy.
*/

function escapujRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Nahradí v texte číslo, s ktorým sa okno otváralo, aktuálnym číslom faktúry.
 * Nahrádza sa len celé číslo — „2026007“ v „20260071“ ostane bez zmeny.
 */
export function sAktualnymCislom(
  text: string | undefined,
  cisloVOkne: string | null | undefined,
  aktualneCislo: string | null | undefined,
): string | undefined {
  if (text == null) return text;
  const stare = String(cisloVOkne ?? "").trim();
  const nove = String(aktualneCislo ?? "").trim();
  if (!stare || !nove || stare === nove) return text;
  const vzor = new RegExp(`(?<![\\p{L}\\p{N}])${escapujRegExp(stare)}(?![\\p{L}\\p{N}])`, "gu");
  return text.replace(vzor, () => nove);
}
