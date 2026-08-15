/**
 * Úložisko, ktoré v telefóne prežije zatvorenie appky.
 *
 * `localStorage` vo WebView reštart **neprežije** — po znovuotvorení je prázdny,
 * hoci sa doň pred chvíľou zapísalo. Zoznamy a jazdy sa preto už dávnejšie
 * presunuli do natívnych `Preferences`, ale **prihlásenie ostalo v prehliadači**
 * a s ním aj výber firmy, moje vozidlo a fronta neodoslaných vecí. Po zabití
 * appky teda bola relácia preč, appka ponúkla prihlásenie — a bez signálu sa
 * prihlásiť nedá. Presne to znamenalo „appka nebeží offline".
 *
 * Tento modul dáva dve veci:
 *
 * 1. `trvaleUlozisko` — asynchrónne úložisko pre Supabase, ktoré si reláciu
 *    odkladá natívne.
 * 2. synchrónne čítanie (`citaj`, `zapis`) pre miesta, ktoré na asynchrónne
 *    prepísať nejde. Drží ich pamäť naplnená pri štarte cez `pripravUlozisko()`.
 *
 * Na webe sa nič nemení — tam je `localStorage` v poriadku a natívne úložisko
 * neexistuje.
 */

/** Čo sa pri štarte natiahne do pamäte. Veľké zoznamy nie — tie sa čítajú na požiadanie. */
const PREDPONY_DO_PAMATE = [
  /^sb-.*-auth-token$/, // prihlásenie zo Supabase
  /^faktero\.active_company$/,
  /^faktero\.vozidlo\./,
  /^faktero\.offline\.queue\./,
  /^faktero\.push\./,
];

function patriDoPamate(kluc: string): boolean {
  return PREDPONY_DO_PAMATE.some((p) => p.test(kluc));
}

type Preferences = {
  get(o: { key: string }): Promise<{ value: string | null }>;
  set(o: { key: string; value: string }): Promise<void>;
  remove(o: { key: string }): Promise<void>;
  keys(): Promise<{ keys: string[] }>;
};

/**
 * Kľúče, ktoré patria do Keychainu, nie do bežného natívneho úložiska.
 *
 * `Preferences` sú na iOS `UserDefaults`: sandbox a šifrovanie zamknutého
 * zariadenia áno, ale obsah ide do nešifrovanej zálohy a na odomknutom
 * zariadení sa dá prečítať. Prihlasovací token je dlhodobý prístup k účtu, tak
 * patrí do Keychainu — teda tam, kam si heslá ukladá systém.
 */
function jeCitlivy(kluc: string): boolean {
  return /^sb-.*-auth-token$/.test(kluc) || kluc.startsWith("faktero.biometric.");
}

type Trezor = {
  getItem(kluc: string): Promise<string | null>;
  setItem(kluc: string, hodnota: string): Promise<void>;
  removeItem(kluc: string): Promise<void>;
};

let trezorUlozisko: Trezor | null | undefined;

/**
 * Keychain, alebo `null`.
 *
 * Keď plugin v balíčku nie je (starší build, web), vráti `null` a token skončí
 * v bežnom natívnom úložisku ako doteraz. Radšej appka, ktorá funguje, než
 * appka, ktorá sa nespustí kvôli chýbajúcemu pluginu.
 */
async function trezor(): Promise<Trezor | null> {
  if (trezorUlozisko !== undefined) return trezorUlozisko;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) {
      trezorUlozisko = null;
      return null;
    }
    const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
    // Zabalené do obyčajného objektu zámerne — pozri poznámku pri `nativne()`.
    trezorUlozisko = {
      getItem: (kluc) => SecureStorage.getItem(kluc) as Promise<string | null>,
      setItem: (kluc, hodnota) => SecureStorage.setItem(kluc, hodnota),
      removeItem: (kluc) => SecureStorage.removeItem(kluc),
    };
  } catch {
    trezorUlozisko = null;
  }
  return trezorUlozisko;
}

let nativneUlozisko: Preferences | null | undefined;

/** Natívne úložisko, alebo `null` na webe. Zisťuje sa raz. */
async function nativne(): Promise<Preferences | null> {
  if (nativneUlozisko !== undefined) return nativneUlozisko;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) {
      nativneUlozisko = null;
      return null;
    }
    const { Preferences } = await import("@capacitor/preferences");
    /*
     * Plugin sa **nesmie vrátiť z asynchrónnej funkcie priamo.**
     *
     * Capacitor ho podáva ako proxy, ktorá z každého prístupu k vlastnosti robí
     * volanie natívnej metódy — vrátane `then`. Plugin je tým pádom „thenable"
     * a `await` naň zavolá `Preferences.then()`, čo v telefóne neexistuje.
     * Výsledok: úložisko sa tvárilo ako nedostupné a všetko spadlo na
     * prehliadačovú náhradu, ktorá reštart neprežije. Preto obyčajný objekt.
     */
    nativneUlozisko = {
      get: (o) => Preferences.get(o),
      set: (o) => Preferences.set(o),
      remove: (o) => Preferences.remove(o),
      keys: () => Preferences.keys(),
    };
  } catch {
    nativneUlozisko = null;
  }
  return nativneUlozisko;
}

/** Synchrónna vrstva nad natívnym úložiskom. Prázdna, kým nebeží `pripravUlozisko`. */
const pamat = new Map<string, string>();
let priprava: Promise<void> | null = null;

function zLokalneho(kluc: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(kluc);
  } catch {
    return null;
  }
}

/**
 * Natiahne dôležité kľúče z natívneho úložiska do pamäte a presunie do neho to,
 * čo ešte ostalo v prehliadači.
 *
 * Volá sa raz pri štarte. Bez toho by prvé synchrónne čítanie vrátilo prázdno a
 * appka by sa tvárila, že o firme ani o prihlásení nič nevie.
 */
export function pripravUlozisko(): Promise<void> {
  priprava ??= (async () => {
    const p = await nativne();
    if (!p) return;

    const { keys } = await p.keys();
    for (const kluc of keys) {
      if (!patriDoPamate(kluc)) continue;
      const { value } = await p.get({ key: kluc });
      if (value == null) continue;
      pamat.set(kluc, value);
      // Citlivé kľúče zo starších verzií presunieme do Keychainu a z bežného
      // úložiska ich odstránime — inak by presun nič neriešil.
      if (jeCitlivy(kluc)) {
        const t = await trezor();
        if (t) {
          try {
            await t.setItem(kluc, value);
            await p.remove({ key: kluc });
          } catch {
            /* keď Keychain nie je, token ostáva tam, kde bol */
          }
        }
      }
    }

    // Čo už v Keychaine je, musí byť aj v pamäti — núdzové čítanie relácie je
    // synchrónne a inak by o prihlásení nevedelo.
    const t = await trezor();
    if (t) {
      try {
        const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
        for (const kluc of await SecureStorage.keys()) {
          if (pamat.has(kluc)) continue;
          const hodnota = await t.getItem(kluc);
          if (hodnota != null) pamat.set(kluc, hodnota);
        }
      } catch {
        /* bez zoznamu kľúčov sa relácia načíta až asynchrónne cez Supabase */
      }
    }

    // Presun z prehliadača. Robí sa raz — po ňom je natívne úložisko zdrojom
    // pravdy a prehliadačové ostáva len ako rýchla kópia.
    try {
      if (typeof localStorage !== "undefined") {
        for (let i = 0; i < localStorage.length; i++) {
          const kluc = localStorage.key(i);
          if (!kluc || !patriDoPamate(kluc) || pamat.has(kluc)) continue;
          const hodnota = localStorage.getItem(kluc);
          if (hodnota == null) continue;
          pamat.set(kluc, hodnota);
          void p.set({ key: kluc, value: hodnota });
        }
      }
    } catch {
      /* neprístupný localStorage nie je dôvod zdržať štart */
    }
  })();
  return priprava;
}

/**
 * Zabudne prihlásenie a s ním všetko, čo patrí k účtu.
 *
 * `signOut()` sa bez signálu nemusí podariť (odvoláva token na serveri), a keby
 * sme sa spoľahli len naň, relácia by v telefóne ostala — na požičanom telefóne
 * je to problém. Toto ju odstráni lokálne bez ohľadu na sieť.
 */
export function zabudniPrihlasenie(): void {
  const citlive = [...pamat.keys()].filter(jeCitlivy);
  for (const kluc of [...pamat.keys()]) {
    if (jeCitlivy(kluc) || kluc === "faktero.active_company") zmaz(kluc);
  }
  // Keychain prežije aj to, čo sme zmazali inde — bez tohto by relácia po
  // odhlásení ostala presne na tom najbezpečnejšom mieste.
  void trezor().then((t) => {
    if (!t) return;
    for (const kluc of citlive) void t.removeItem(kluc).catch(() => {});
  });
  try {
    if (typeof localStorage !== "undefined") {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const kluc = localStorage.key(i);
        if (kluc && /^sb-.*-auth-token$/.test(kluc)) zmaz(kluc);
      }
    }
  } catch {
    /* nič */
  }
  zmaz("faktero.active_company");
}

/** Len pre testy — synchrónna pamäť medzi nimi nemá pretekať. */
export function vycistiPamat(): void {
  pamat.clear();
}

/** Kľúče, ktoré sú po `pripravUlozisko()` v pamäti. */
export function klucePamate(): string[] {
  return [...pamat.keys()];
}

/** Prečíta hodnotu. V telefóne z pamäte naplnenej natívnym úložiskom. */
export function citaj(kluc: string): string | null {
  if (pamat.has(kluc)) return pamat.get(kluc) ?? null;
  return zLokalneho(kluc);
}

/** Zapíše hodnotu — natívne (aby prežila) aj do prehliadača (aby bola po ruke). */
export function zapis(kluc: string, hodnota: string): void {
  pamat.set(kluc, hodnota);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(kluc, hodnota);
  } catch {
    /* plné úložisko — natívne nižšie je dôležitejšie */
  }
  void nativne().then((p) => p?.set({ key: kluc, value: hodnota }).catch(() => {}));
}

/** Zmaže hodnotu na všetkých miestach naraz. */
export function zmaz(kluc: string): void {
  pamat.delete(kluc);
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(kluc);
  } catch {
    /* nič */
  }
  void nativne().then((p) => p?.remove({ key: kluc }).catch(() => {}));
}

/**
 * Úložisko pre Supabase.
 *
 * Supabase pripúšťa aj asynchrónne úložisko, takže sa relácia dá držať natívne.
 * Čítanie berie natívne ako zdroj pravdy a na prehliadačové sa spolieha len
 * dovtedy, kým sa relácia prvýkrát prepíše.
 */
export const trvaleUlozisko = {
  async getItem(kluc: string): Promise<string | null> {
    if (jeCitlivy(kluc)) {
      const t = await trezor();
      if (t) {
        try {
          const zTrezoru = await t.getItem(kluc);
          if (zTrezoru != null) {
            pamat.set(kluc, zTrezoru);
            return zTrezoru;
          }
        } catch {
          /* nižšie sa skúsi bežné úložisko */
        }
      }
    }
    const p = await nativne();
    if (p) {
      try {
        const { value } = await p.get({ key: kluc });
        if (value != null) {
          pamat.set(kluc, value);
          return value;
        }
      } catch {
        /* skúsime prehliadač */
      }
    }
    return citaj(kluc);
  },

  async setItem(kluc: string, hodnota: string): Promise<void> {
    pamat.set(kluc, hodnota);

    if (jeCitlivy(kluc)) {
      const t = await trezor();
      if (t) {
        try {
          await t.setItem(kluc, hodnota);
          // Token nesmie ostať aj na starom mieste — inak by presun do
          // Keychainu nič neriešil.
          try {
            if (typeof localStorage !== "undefined") localStorage.removeItem(kluc);
          } catch {
            /* nič */
          }
          void nativne().then((p) => p?.remove({ key: kluc }).catch(() => {}));
          return;
        } catch {
          /* Keychain zlyhal — nižšie ostáva pôvodná cesta */
        }
      }
    }

    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(kluc, hodnota);
    } catch {
      /* nič */
    }
    const p = await nativne();
    if (p) {
      try {
        await p.set({ key: kluc, value: hodnota });
      } catch {
        /* nič */
      }
    }
  },

  async removeItem(kluc: string): Promise<void> {
    if (jeCitlivy(kluc)) {
      const t = await trezor();
      if (t) await t.removeItem(kluc).catch(() => {});
    }
    zmaz(kluc);
  },
};
