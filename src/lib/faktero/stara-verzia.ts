/**
 * Záchrana karty, ktorá ostala visieť na starom vydaní.
 *
 * Stránka sa načítava po kúskoch a každý kúsok má v názve odtlačok obsahu
 * (`index-C8UymCAB.js`). Po nasadení má nové vydanie iné názvy a tie staré
 * server už nepozná — vráti 404. Karta, ktorá bola otvorená pred nasadením,
 * teda funguje dovtedy, kým nepotrebuje kúsok, ktorý si ešte nestiahla; vtedy
 * prestane reagovať a navonok to vyzerá, že „Faktero nejde".
 *
 * Najviac to bolí v appke v telefóne — tá webové rozhranie drží otvorené
 * celé dni.
 *
 * Riešenie je jediné rozumné: keď sa kúsok nepodarí stiahnuť, stránku načítať
 * znova. Nové vydanie sa tým natiahne celé a človek pokračuje tam, kde bol.
 * Poistka proti slučke je v `sessionStorage` — keby bola príčina iná než staré
 * vydanie (napríklad vypadnutá sieť), druhýkrát sa už nenačítava a chyba
 * vyplávi normálne.
 */

const KLUC = "faktero-obnovene-po-nasadeni";

/** Koľko sekúnd po obnovení sa druhý pokus považuje za slučku. */
const TICHO_S = 60;

export function sledujStareVydanie() {
  if (typeof window === "undefined") return;

  window.addEventListener("vite:preloadError", (e) => {
    let poslednaObnova = 0;
    try {
      poslednaObnova = Number(sessionStorage.getItem(KLUC) ?? 0);
    } catch {
      // Súkromné okno bez úložiska — radšej neobnovovať vôbec než v slučke.
      return;
    }

    if (Date.now() - poslednaObnova < TICHO_S * 1000) return;

    e.preventDefault();
    try {
      sessionStorage.setItem(KLUC, String(Date.now()));
    } catch {
      return;
    }
    console.warn("[verzia] chýbajúci kúsok stránky — načítavam nové vydanie");
    window.location.reload();
  });
}
