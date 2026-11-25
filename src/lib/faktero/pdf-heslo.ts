/** Text chyby nespracovaného dokladu so zaheslovaným PDF — podľa neho rozhranie ponúkne zadanie hesla. */
export const CHYBA_ZAHESLOVANE = "PDF je chránené heslom — zadajte heslo, aby sa dalo otvoriť a prečítať.";

/** Začiatok chyby čítania výpisu, podľa ktorého prehliadač vypýta heslo a pošle ho znova (bez exportu z *.functions.ts). */
export const CHYBA_VYPIS_HESLO = "Výpis je chránený heslom";

export function jeChybaZaheslovane(chyba: string | null | undefined): boolean {
  return chyba === CHYBA_ZAHESLOVANE;
}
