/**
 * Čo appka robí, keď sa vráti signál.
 *
 * Pôvodne tu bola všeobecná fronta HTTP požiadaviek (`queueOrPost`) — lenže ju
 * **nikto nikdy nevolal**. Fronta bola vždy prázdna a po pripojení sa vyprázdnil
 * prázdny zoznam. Skutočná offline práca sa medzitým odkladá na dvoch iných
 * miestach: jazdy v `jazdy-lokalne` a doklady v `doklady-fronta`. Zmizla teda
 * atrapa a ostalo to, čo sa naozaj používa.
 *
 * Doklady si po pripojení posiela obrazovka Prijaté doklady, kým je otvorená.
 * Jazdy nemal kto — odosielali sa len pri otvorení obrazovky Jazda, takže jazda
 * zapísaná bez signálu mohla v telefóne ležať týždeň. Preto sa po pripojení
 * posielajú odtiaľto.
 */

/**
 * Je signál?
 *
 * V telefóne sa pýtame systému; `navigator.onLine` vo WebView tvrdí „online" aj
 * vtedy, keď sa von nedostane nič.
 */
export async function isOnline(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Network } = await import("@capacitor/network");
      const s = await Network.getStatus();
      return s.connected;
    }
  } catch {
    // @capacitor/network nie je vo webovom builde — nižšie sa použije navigator.onLine
  }
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/**
 * Pošle, čo v telefóne čaká na signál. Ticho — človek o tom nemusí vedieť.
 *
 * Doklady sa dovtedy posielali len vtedy, keď mal otvorenú ich obrazovku;
 * naskenovaný bloček tak mohol čakať aj po tom, čo sa signál dávno vrátil.
 * Operácie chodia cez `server-most-volanie`, ktorý funguje aj mimo komponentu —
 * na webe volá serverovú funkciu priamo, v appke cez endpoint.
 */
async function posliCoCaka(): Promise<void> {
  const { getActiveCompanyId } = await import("@/lib/faktero/active-company").catch(() => ({
    getActiveCompanyId: () => null,
  }));
  const firma = getActiveCompanyId();
  if (!firma) return;

  try {
    const { odosliCakajuceZapisy } = await import("./jazdy-lokalne");
    await odosliCakajuceZapisy(firma);
  } catch {
    /* ďalší pokus príde pri ďalšom pripojení alebo pri otvorení obrazovky */
  }

  try {
    const { pocetVoFronte } = await import("./doklady-fronta");
    if ((await pocetVoFronte(firma)) === 0) return;

    const { volajOperaciu } = await import("@/lib/mobile/server-most-volanie");
    const { odosliCakajuce } = await import("./doklady-odoslanie");
    await odosliCakajuce(
      firma,
      (vstup) => volajOperaciu("blocek-precitaj", vstup.data),
      (vstup) => volajOperaciu("vydavok-uloz", vstup.data),
    );
  } catch {
    /* to isté — obrazovka Prijaté doklady to skúsi znova */
  }
}

export function initOfflineSync() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => {
    void posliCoCaka();
  });
  (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const { Network } = await import("@capacitor/network");
      await Network.addListener("networkStatusChange", (s) => {
        if (s.connected) void posliCoCaka();
      });
    } catch {
      // Bez Network pluginu ostáva `online` event z prehliadača.
    }
  })();
}
