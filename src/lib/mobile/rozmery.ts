/**
 * Rozmery, na ktorých sa musí zhodnúť lišta aj obsah nad ňou.
 *
 * Spodná lišta je `sticky bottom-0`. Kým bola jej výška a miesto, ktoré jej
 * layout rezervuje, dve nezávislé čísla, rozišli sa: rezervovaných bolo 94 px,
 * lišta merala 83. Na obrazovke, ktorá sa nerolovala, potom končila 11 px nad
 * spodkom displeja, na rolovateľnej ju `sticky` pritlačila celkom dole — a pri
 * prepnutí záložky lišta o tých 11 px poskočila.
 *
 * Preto je to jedno číslo na jednom mieste: lišta si ním nastaví výšku a obal
 * ho dá do `--spodna-lista`, z ktorej si obsah počíta odsadenie zdola.
 */

/** Vlastná výška lišty bez bezpečnej zóny: 1 px linka + 48 px obsah. */
export const VYSKA_LISTY = "3.0625rem";

/** To isté aj s bezpečnou zónou telefónu — toľko miesta lišta naozaj zaberie. */
export const SPODNA_LISTA = `calc(${VYSKA_LISTY} + var(--safe-bottom))`;
