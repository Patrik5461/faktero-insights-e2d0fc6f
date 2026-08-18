/**
 * Príznaky z adresy.
 *
 * Parametre v `search` sú v tomto projekte opakovaný zdroj tichých chýb: čo
 * `validateSearch` neprepustí, to sa zahodí bez slova a stránka sa otvorí
 * nefiltrovaná — odkaz vyzerá, že funguje, a pritom neurobí nič. Raz to boli
 * položky menu, potom karty v AI asistentovi a nakoniec `?poSplatnosti=1`,
 * ktoré si smerovač rozparsoval na **číslo** `1`, kým kód porovnával s reťazcom.
 *
 * Preto je porovnanie tu, s testom, a nie rozpísané v každej trase zvlášť.
 */

/** Zapnutý príznak: `?x=true`, `?x=1` aj `?x` bez hodnoty. */
export function jeZapnute(v: unknown): boolean {
  return v === true || v === 1 || v === "true" || v === "1" || v === "";
}
