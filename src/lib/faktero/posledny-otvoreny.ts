/*
  Naposledy otvorený doklad v zozname (ako v Doklado): po návrate z detailu
  k nemu zoznam doroluje. Farebne sa NEzvýrazňuje — zelený pruh a pozadie
  ostávajúce na riadku vyzerali ako zaseknutá myš (2026-11-04); zelené je
  len zaškrtnutie (hromadný výber). Pamätá sa len
  v prehliadači (localStorage), zvlášť pre každý zoznam a firmu — do
  databázy to nepatrí. Prístup k úložisku môže zlyhať (súkromné okno,
  zablokované dáta), preto všetko v try/catch a bez úložiska sa nič nedeje.
*/

export type ZoznamDokladov = "nespracovane" | "prijate-faktury" | "doklady";

type Uloziste = Pick<Storage, "getItem" | "setItem">;

/**
 * Doklad, ktorý je práve v bočnom náhľade — nenápadné neutrálne pozadie,
 * žiadna zelená ani pruh. Zelené pozadie s pruhom patrí len zaškrtnutému
 * riadku (kreslí ho CSS cez `:has(:checked)`, takže je vždy v súlade
 * so zaškrtávadlom).
 */
export const OZNACENIE_V_NAHLADE = "bg-muted/40";

export function klucPoslednehoOtvoreneho(
  zoznam: ZoznamDokladov,
  companyId: string | null | undefined,
): string {
  return `faktero:posledny-otvoreny:${zoznam}:${companyId || "-"}`;
}

function uloziste(u?: Uloziste | null): Uloziste | null {
  if (u !== undefined) return u;
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Zapamätá si otvorený doklad. */
export function zapamatajOtvoreny(
  zoznam: ZoznamDokladov,
  companyId: string | null | undefined,
  id: string | null | undefined,
  u?: Uloziste | null,
): void {
  const s = uloziste(u);
  if (!s || !id) return;
  try {
    s.setItem(klucPoslednehoOtvoreneho(zoznam, companyId), String(id));
  } catch {
    /* plné či zablokované úložisko — zvýraznenie je len pohodlie */
  }
}

/** Naposledy otvorený doklad zoznamu (null = žiadny alebo úložisko nejde). */
export function poslednyOtvoreny(
  zoznam: ZoznamDokladov,
  companyId: string | null | undefined,
  u?: Uloziste | null,
): string | null {
  const s = uloziste(u);
  if (!s) return null;
  try {
    const v = s.getItem(klucPoslednehoOtvoreneho(zoznam, companyId));
    return v && v.length <= 100 ? v : null;
  } catch {
    return null;
  }
}
