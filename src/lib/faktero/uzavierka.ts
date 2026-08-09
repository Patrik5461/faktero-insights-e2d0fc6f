/**
 * Uzamknutie období (v POHODE uzávierka).
 *
 * Zmysel je jediný: po podaní priznania sa už doklad z toho obdobia nesmie
 * zmeniť. Bez toho sa dá v septembri opraviť augustová faktúra, DPH prehľad
 * sa prepočíta a na daňovom úrade ostane iné číslo — a nikde to nezasvieti.
 *
 * Dátumy sa všade držia ako `YYYY-MM-DD`. Reťazce v tomto tvare sa dajú
 * porovnávať priamo a nemajú pásmo, takže polnoc v inom časovom pásme
 * neposunie doklad o deň.
 */

export type Datum = string; // YYYY-MM-DD

const TVAR = /^\d{4}-\d{2}-\d{2}$/;

export function jeDatum(v: unknown): v is Datum {
  return typeof v === "string" && TVAR.test(v);
}

/** Doklad je uzamknutý, keď jeho dátum spadá do uzavretého obdobia vrátane. */
export function jeUzamknute(datum: unknown, uzamknuteDo: unknown): boolean {
  if (!jeDatum(datum) || !jeDatum(uzamknuteDo)) return false;
  return datum <= uzamknuteDo;
}

function dvojcifre(n: number): string {
  return String(n).padStart(2, "0");
}

/** Posledný deň zadaného mesiaca. `mesiac` je 1–12. */
export function koniecMesiaca(rok: number, mesiac: number): Datum {
  // Nultý deň nasledujúceho mesiaca je posledný deň tohto; `Date.UTC` obchádza
  // miestne pásmo, ktoré by pri polnoci posunulo dátum o deň.
  const d = new Date(Date.UTC(rok, mesiac, 0));
  return `${d.getUTCFullYear()}-${dvojcifre(d.getUTCMonth() + 1)}-${dvojcifre(d.getUTCDate())}`;
}

function rozlozi(dnes: Datum): { rok: number; mesiac: number } {
  return { rok: Number(dnes.slice(0, 4)), mesiac: Number(dnes.slice(5, 7)) };
}

/** Koniec mesiaca pred zadaným dňom — najčastejšia voľba po podaní priznania. */
export function koniecPredoslehoMesiaca(dnes: Datum): Datum {
  const { rok, mesiac } = rozlozi(dnes);
  return mesiac === 1 ? koniecMesiaca(rok - 1, 12) : koniecMesiaca(rok, mesiac - 1);
}

/** Koniec štvrťroka pred tým, do ktorého zadaný deň patrí. */
export function koniecPredoslehoStvrtroka(dnes: Datum): Datum {
  const { rok, mesiac } = rozlozi(dnes);
  const stvrtrok = Math.ceil(mesiac / 3);
  return stvrtrok === 1 ? koniecMesiaca(rok - 1, 12) : koniecMesiaca(rok, (stvrtrok - 1) * 3);
}

/** Koniec predošlého kalendárneho roka. */
export function koniecPredoslehoRoka(dnes: Datum): Datum {
  return koniecMesiaca(rozlozi(dnes).rok - 1, 12);
}

/**
 * Posun zámku dozadu je odomknutie — používateľ o tom musí vedieť, lebo tým
 * znova otvára obdobie, ktoré už bolo podané.
 */
export function jeOdomknutie(povodne: unknown, nove: unknown): boolean {
  if (!jeDatum(povodne)) return false;
  if (!jeDatum(nove)) return true; // zrušenie zámku úplne
  return nove < povodne;
}

export function formatujDatum(d: unknown): string {
  if (!jeDatum(d)) return "—";
  return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
}
