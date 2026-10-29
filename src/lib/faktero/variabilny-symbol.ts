/*
  Variabilný symbol z čísla dokladu — jedno pravidlo pre celú aplikáciu.

  Vystavený doklad: VS sú číslice z čísla dokladu („FA-2026-0042" → „20260042").
  Dlhšie číslo sa skráti na posledných 10 číslic (SEPA aj PAY by square berú
  najviac 10), aby ostalo poradové číslo.

  Prijatá faktúra: VS určuje dodávateľ, preto sa z čísla berie len vtedy, keď je
  číslo celé z číslic (1–10). Vyskladané číslice z „FV/2026/42" by dali symbol,
  ktorý dodávateľ nikdy nevystavil (rovnaké pravidlo ako v hromadnom príkaze).

  Zadaný VS sa nikdy neprepisuje. Rovnaké pravidlá má databázový spúšťač
  `doplnit_variabilny_symbol` — pri zmene treba upraviť obe miesta.
*/

/** Najdlhší variabilný symbol (SEPA, PAY by square). */
export const VS_MAX = 10;

function text(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** VS vystaveného dokladu odvodený z jeho čísla; "" keď číslo nemá číslice. */
export function vsZCislaDokladu(cislo: unknown): string {
  return text(cislo).replace(/\D/g, "").slice(-VS_MAX);
}

/** VS prijatej faktúry z čísla — len keď je číslo celé z číslic. */
export function vsZCislaPrijatej(cislo: unknown): string {
  const c = text(cislo).replace(/\s/g, "");
  return /^\d+$/.test(c) && c.length <= VS_MAX ? c : "";
}

type Doklad = {
  variable_symbol?: unknown;
  invoice_number?: unknown;
};

/** VS vystaveného dokladu: zadaný, inak odvodený z čísla. */
export function vsVystavenej(d: Doklad | null | undefined): string {
  return text(d?.variable_symbol) || vsZCislaDokladu(d?.invoice_number);
}

/** VS prijatej faktúry: zadaný, inak číslo faktúry, ak je celé z číslic. */
export function vsPrijatej(d: Doklad | null | undefined): string {
  return text(d?.variable_symbol) || vsZCislaPrijatej(d?.invoice_number);
}

/** Na uloženie vystaveného dokladu: zadaný VS, inak odvodený, inak null. */
export function vsNaUlozenie(zadany: unknown, cislo: unknown): string | null {
  return text(zadany) || vsZCislaDokladu(cislo) || null;
}

/** Na uloženie prijatej faktúry: zadaný VS, inak číslo (len číslice), inak null. */
export function vsPrijatejNaUlozenie(zadany: unknown, cislo: unknown): string | null {
  return text(zadany) || vsZCislaPrijatej(cislo) || null;
}
