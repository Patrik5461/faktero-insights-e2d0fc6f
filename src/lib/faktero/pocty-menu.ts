/*
  Odznaky s počtami v menu (Nespracované, Prijaté eFaktúry, Moje úlohy).

  Počty dáva jedna serverová funkcia (`pocetMojichUlohFn`) a obnovujú sa raz
  za minútu. Pri prechode na inú stránku sa znova pýtajú len vtedy, keď
  človek odchádza zo stránky, kde mohol niečo, čo sa počíta, vybaviť
  (doklady, faktúry, úlohy…), alebo keď sú staršie než `POCTY_PLATIA_MS`.
  Prechod napr. z Adresára do Cenníka sa tak servera nepýta vôbec.
*/

/** Udalosť, po ktorej sa počty v menu načítajú hneď. */
export const POCTY_ZMENENE = "faktero:pocty-menu";

/** Ako dlho vydržia počty v pamäti pri prechode medzi „pokojnými“ stránkami. */
export const POCTY_PLATIA_MS = 30_000;

/**
 * Stránky, na ktorých sa dá vybaviť niečo, čo sa v odznakoch počíta:
 * nespracované doklady a bločky, eFaktúry, schvaľovanie a komentáre (tie
 * môžu byť na ktoromkoľvek doklade).
 */
const DOKLADOVE = [
  "/nespracovane",
  "/doklady",
  "/prijate-faktury",
  "/prijate-zalohove",
  "/faktury",
  "/zalohove",
  "/efaktura",
  "/moje-ulohy",
  "/schvalovanie",
  "/ostatne-doklady",
  "/ponuky",
  "/objednavky",
  "/kos",
];

function jeDokladova(cesta: string) {
  return DOKLADOVE.some((p) => cesta === p || cesta.startsWith(p + "/"));
}

/** Treba pri prechode z `predosla` na `nova` načítať počty znova? */
export function trebaObnovitPocty(
  predosla: string | null,
  nova: string,
  odPoslednehoMs: number,
): boolean {
  if (predosla === null) return true;
  if (predosla === nova) return false;
  if (jeDokladova(predosla)) return true;
  return odPoslednehoMs > POCTY_PLATIA_MS;
}

/** Požiada menu, aby si počty načítalo hneď (napr. po vybavení dokladu). */
export function obnovPoctyMenu() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(POCTY_ZMENENE));
}
