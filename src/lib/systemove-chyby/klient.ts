/*
  Zachytávanie chýb v prehliadači a v mobilnej appke → /api/public/chyby
  → Admin → Chyby.

  - `window.onerror` a `unhandledrejection` sa zachytia samé po
    `zachytavajChyby()`; chybové hranice React volajú `nahlasChybu()`.
  - Šum (rozšírenia, ResizeObserver, zrušené požiadavky, výpadok siete) sa
    neposiela vôbec. Chyba po novom vydaní (chýbajúci kúsok stránky) ide ako
    „staré vydanie“ — nie je to chyba kódu, len stará kópia stránky.
  - Najviac 10 hlásení na stránku a to isté len raz; nikdy nič nezhodí.
  - Neposiela sa nič o človeku ani o dokladoch: správa a stack prejdú
    `bezTajomstiev`, z adresy sa berie len cesta bez query a fragmentu.
*/
import {
  bezTajomstiev,
  cistaTrasa,
  cistyStack,
  jeSumPrehliadaca,
  odtlacokChyby,
  rozoberChybu,
} from "./spolocne";

type Nastavenie = {
  /** Bez zdroja (web) sa určí z adresy: `/app…` je appka, inak prehliadač. */
  zdroj?: "prehliadac" | "appka";
  /** Absolútna adresa pre appku (beží na capacitor://localhost). */
  adresa?: string;
  vydanie?: string | null;
};

const MAX_ZA_STRANKU = 10;

let nastavenie: Nastavenie | null = null;
let odoslane = 0;
const videne = new Set<string>();

/** Pošle chybu, ak nie je šum a ešte nebola poslaná. Nikdy nehodí. */
export function nahlasChybu(
  chyba: unknown,
  typ: "onerror" | "unhandledrejection" | "hranica" | "rucne" = "rucne",
  subor?: string | null,
): void {
  try {
    if (typeof window === "undefined") return;
    const n = nastavenie ?? {};
    const zdroj =
      n.zdroj ?? (/^\/app(\/|-|$)/.test(window.location.pathname) ? "appka" : "prehliadac");
    const { sprava, stack } = rozoberChybu(chyba);
    if (jeSumPrehliadaca({ sprava, stack, subor })) return;
    const cistaSprava = bezTajomstiev(sprava, 2000);
    const cistyZasobnik = cistyStack(stack);
    const kluc = odtlacokChyby({ zdroj, sprava: cistaSprava, stack: cistyZasobnik });
    if (videne.has(kluc) || odoslane >= MAX_ZA_STRANKU) return;
    videne.add(kluc);
    odoslane++;
    const telo = JSON.stringify({
      zdroj,
      typ,
      sprava: cistaSprava,
      stack: cistyZasobnik?.slice(0, 6000) ?? null,
      subor: subor ? cistaTrasa(subor) : null,
      trasa: cistaTrasa(window.location.pathname),
      vydanie: n.vydanie ?? null,
    });
    void fetch(n.adresa ?? "/api/public/chyby", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: telo,
      keepalive: true,
      credentials: "omit",
    }).catch(() => {});
  } catch {
    /* hlásenie chyby nesmie spôsobiť ďalšiu */
  }
}

/** Zapne zachytávanie nezachytených chýb. Volať raz pri štarte. */
export function zachytavajChyby(n: Nastavenie): void {
  if (typeof window === "undefined" || nastavenie) return;
  nastavenie = n;
  window.addEventListener("error", (e: ErrorEvent) => {
    // Chyba načítania <script>/<img> nemá `error` ani správu — to nie je pád kódu.
    if (!e.error && !e.message) return;
    nahlasChybu(e.error ?? e.message, "onerror", e.filename);
  });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    nahlasChybu(e.reason, "unhandledrejection");
  });
}

/** Len pre testy. */
export function _resetKlienta() {
  nastavenie = null;
  odoslane = 0;
  videne.clear();
}
