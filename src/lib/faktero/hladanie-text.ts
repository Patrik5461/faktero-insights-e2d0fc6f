/*
  Spoločné porovnávanie textu pri hľadaní — hlasové ovládanie (`hlas-hladanie.ts`)
  aj hľadanie v hlavičke (`globalne-hladanie.ts`).

  Ľudia píšu bez diakritiky a bez právnej formy („novak“ pre „Novák s.r.o.“),
  preto sa porovnáva bez diakritiky, po slovách a bez slov, ktoré v názve firmy
  nič nehovoria.
*/

export function normalizuj(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Slová, ktoré v názve firmy nič nehovoria (právna forma, spojky). */
export const PRAZDNE_SLOVA = new Set([
  "s",
  "r",
  "o",
  "sro",
  "a",
  "as",
  "spol",
  "sp",
  "z",
  "oo",
  "zoo",
  "ltd",
  "gmbh",
  "inc",
  "kft",
  "ag",
  "se",
  "v",
  "k",
  "ks",
  "vos",
  "druzstvo",
  "od",
  "pre",
  "firma",
  "firmu",
  "firmy",
  "spolocnost",
]);

export function slovaNazvu(s: string | null | undefined): string[] {
  return normalizuj(s)
    .split(" ")
    .filter((x) => x && !PRAZDNE_SLOVA.has(x));
}

/**
 * Písmená, ktoré môžu mať v názve diakritiku (SK, CZ, DE, HU, PL). Regulárny
 * výraz `n[oóôöő]v[aáäàâ]k` nájde v databáze „Novák“ aj bez rozšírenia
 * `unaccent` — PostgREST `imatch` (`~*`) to vie priamo nad stĺpcom.
 */
const VARIANTY: Record<string, string> = {
  a: "aáäàâ",
  c: "cčć",
  d: "dď",
  e: "eéěëè",
  i: "iíî",
  l: "lľĺł",
  n: "nňń",
  o: "oóôöő",
  r: "rŕř",
  s: "sšś",
  t: "tť",
  u: "uúůüű",
  y: "yý",
  z: "zžźż",
};

/** Slovo (už normalizované, len a-z0-9) ako regulárny výraz bez ohľadu na diakritiku. */
export function regexSlova(slovo: string): string {
  return [...normalizuj(slovo).replace(/ /g, "")]
    .map((ch) => (VARIANTY[ch] ? `[${VARIANTY[ch]}]` : ch))
    .join("");
}

/**
 * Regulárny výraz pre názov: slová dotazu v tomto poradí, medzi nimi čokoľvek
 * („novak bau“ ~ „Novák-Bau s.r.o.“). Právna forma sa vynechá; keď dotaz nemá
 * nič iné („a.s.“), ostanú jeho slová. Prázdny dotaz → null.
 */
export function regexNazvu(dotaz: string | null | undefined): string | null {
  let slova = slovaNazvu(dotaz);
  if (!slova.length) slova = normalizuj(dotaz).split(" ").filter(Boolean);
  if (!slova.length) return null;
  return slova.map(regexSlova).join(".*");
}

/** Zhoduje sa názov s dotazom podľa `regexNazvu`? (Rovnaké pravidlo ako v databáze.) */
export function sedyNazov(dotaz: string, nazov: string | null | undefined): boolean {
  let slova = slovaNazvu(dotaz);
  if (!slova.length) slova = normalizuj(dotaz).split(" ").filter(Boolean);
  if (!slova.length) return false;
  const n = normalizuj(nazov);
  let od = 0;
  for (const s of slova) {
    const i = n.indexOf(s, od);
    if (i < 0) return false;
    od = i + s.length;
  }
  return true;
}
