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

/** Ako často sa karta pýta, či medzitým nevyšlo nové vydanie. */
const KONTROLA_MS = 5 * 60_000;

/**
 * Karta zo starého vydania volá serverové funkcie, ktoré nové vydanie už
 * nepozná („Invalid server action param for serverFnId“) — akcia skončí
 * chybou a človek nevie prečo. Po každom nasadení sa to stalo desiatkam
 * požiadaviek.
 *
 * Karta si preto pri návrate do okna a každých 5 minút overí vydanie na
 * serveri. Keď je novšie, najbližší prechod na inú stránku sa načíta celý
 * (nič sa nestratí), a keď serverová funkcia medzitým zlyhá, stránka sa
 * po krátkom ohlásení obnoví sama.
 */
export function sledujNoveVydanie(router: {
  subscribe: (udalost: any, fn: (e: any) => void) => () => void;
}) {
  if (typeof window === "undefined") return;
  // Mobilný balíček má vlastné vydanie v telefóne — tam sa neobnovuje podľa webu.
  if (typeof __FAKTERO_VYDANIE__ !== "string") return;
  // Router sa môže vytvoriť viackrát — fetch sa smie obaliť len raz.
  const w = window as unknown as { __fakteroSledujeVydanie?: boolean };
  if (w.__fakteroSledujeVydanie) return;
  w.__fakteroSledujeVydanie = true;
  const moje = __FAKTERO_VYDANIE__;
  let stare = false;

  async function over(): Promise<boolean> {
    if (stare) return true;
    try {
      const r = await fetch("/api/public/verzia", { cache: "no-store" });
      const j = (await r.json()) as { vydanie?: string | null };
      if (j.vydanie && j.vydanie !== moje) stare = true;
    } catch {
      /* bez siete sa nič nemení */
    }
    return stare;
  }

  window.setInterval(() => void over(), KONTROLA_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void over();
  });

  // Prechod na inú stránku v starom vydaní: načítať ju celú z nového vydania.
  router.subscribe("onBeforeNavigate", (e: any) => {
    if (!stare) return;
    const ciel = e?.toLocation?.href;
    if (ciel) window.location.assign(ciel);
  });

  // Serverová funkcia zlyhala — ak je na serveri novšie vydanie, je to skoro iste ono.
  const povodny = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const odpoved = await povodny(...args);
    try {
      const url =
        typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url;
      if (odpoved.status >= 500 && url.includes("/_serverFn/") && (await over())) obnovPoNasadeni();
    } catch {
      /* kontrola nesmie pokaziť samotnú požiadavku */
    }
    return odpoved;
  };
}

function obnovPoNasadeni() {
  let posledna = 0;
  try {
    posledna = Number(sessionStorage.getItem(KLUC) ?? 0);
  } catch {
    return;
  }
  if (Date.now() - posledna < TICHO_S * 1000) return;
  try {
    sessionStorage.setItem(KLUC, String(Date.now()));
  } catch {
    return;
  }
  void import("sonner").then(({ toast }) =>
    toast.info("Faktero sa práve aktualizovalo — stránka sa obnoví. Akciu potom zopakujte."),
  );
  window.setTimeout(() => window.location.reload(), 1800);
}
