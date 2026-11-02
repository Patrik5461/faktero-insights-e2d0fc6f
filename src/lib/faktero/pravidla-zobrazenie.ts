/*
  Zoznam pravidiel automatického účtovania (/uctovnictvo/pravidla) — čo ukázať pri prázdnej
  záložke (E-27) a kedy povedať, že „Sedí na“ počíta len z posledných
  dokladov (E-30).
*/
import type { DruhPravidla } from "./pravidla-uctovania";

export type ZalozkaPravidiel = "vsetky" | DruhPravidla | "predlohy";

/** Pravidlo bez druhu platí pre bločky aj prijaté faktúry. */
export function pravidloVZalozke(r: { druh?: DruhPravidla | null }, z: ZalozkaPravidiel): boolean {
  return z === "vsetky" || r.druh === z || (!r.druh && (z === "blocek" || z === "prijata"));
}

/**
 * Prázdny stav zoznamu: `ziadne` = firma nemá žiadne pravidlo (návod),
 * `zalozka` = pravidlá sú, ale v tejto záložke nie; `null` = tabuľka.
 */
export function prazdnyStavPravidiel(
  pravidla: readonly { druh?: DruhPravidla | null }[],
  z: ZalozkaPravidiel,
): "ziadne" | "zalozka" | null {
  if (!pravidla.length) return "ziadne";
  return pravidla.some((r) => pravidloVZalozke(r, z)) ? null : "zalozka";
}

/** Koľko posledných dokladov každého druhu sa načíta na náhľad „Sedí na“. */
export const STROP_NAHLADU_PRAVIDIEL = 1000;

export type StropNahladu = { blocek: boolean; prijata: boolean; vystavena: boolean };

/** Ktorý druh dokladov narazil na strop (načítalo sa ich presne 1 000). */
export function stropNahladu(pocty: {
  blocek: number;
  prijata: number;
  vystavena: number;
}): StropNahladu {
  const s = (n: number) => n >= STROP_NAHLADU_PRAVIDIEL;
  return { blocek: s(pocty.blocek), prijata: s(pocty.prijata), vystavena: s(pocty.vystavena) };
}

/** Počet „Sedí na“ pre pravidlo je len z posledných 1 000 dokladov? */
export function pocetZoStropu(r: { druh?: DruhPravidla | null }, strop: StropNahladu): boolean {
  if (r.druh === "banka") return false;
  if (!r.druh) return strop.blocek || strop.prijata;
  return strop[r.druh];
}
