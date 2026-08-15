/**
 * Rozhodnutia pri štarte appky.
 *
 * Boli zamotané v `zisti()` uprostred šiestich `await` volaní, takže sa nedali
 * overiť inak než na telefóne — a práve tu sa chyba prejaví najnepríjemnejšie:
 * appka sa buď pýta na firmu pri každom otvorení, alebo mlčky pracuje za inú
 * firmu, než si človek vybral.
 */

export type FirmaVolba = { id: string; name: string };

/**
 * Ktorá firma sa má otvoriť.
 *
 * Prednosť má tá, ktorú si človek naposledy vybral. Keď v zozname nie je
 * (odobrali mu prístup, prepol účet), a firma je jediná, otvorí sa sama —
 * pýtať sa pri jedinej možnosti nemá zmysel. Inak nech si vyberie.
 */
export function vyberFirmy<T extends FirmaVolba>(zoznam: T[], ulozenaId: string | null): T | null {
  if (!zoznam.length) return null;
  const najdena = ulozenaId ? (zoznam.find((f) => f.id === ulozenaId) ?? null) : null;
  if (najdena) return najdena;
  return zoznam.length === 1 ? zoznam[0] : null;
}

export type KrokStartu = "prihlasenie" | "firma" | "domov";

/**
 * Kam appka po štarte pôjde.
 *
 * `maRelaciu` je zámerne oddelené od toho, či sa podarilo overiť sa na serveri:
 * bez signálu sa relácia overiť nedá, ale zapamätaná stačí na to, aby sa appka
 * otvorila. Inak by offline poslala prihláseného človeka na prihlásenie — a to
 * je presne tá slepá ulička, ktorú offline režim rieši.
 */
export function dalsiKrok(vstup: {
  maRelaciu: boolean;
  zoznamFiriem: FirmaVolba[];
  ulozenaFirmaId: string | null;
}): KrokStartu {
  if (!vstup.maRelaciu) return "prihlasenie";
  return vyberFirmy(vstup.zoznamFiriem, vstup.ulozenaFirmaId) ? "domov" : "firma";
}
