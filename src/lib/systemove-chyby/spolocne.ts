/*
  Systémové chyby — spoločné čisté funkcie pre server, prehliadač aj appku.

  Do Admin → Chyby sa zapisujú pády servera, chyby server funkcií a hookov,
  nezachytené chyby z prehliadača a z mobilnej appky. Rovnaké chyby sa
  zlučujú podľa odtlačku (zdroj + správa bez čísel a identifikátorov + miesto
  v kóde), takže chyba v slučke spraví jeden riadok s počtom, nie tisíce.

  Nič odtiaľto nesmie siahať na server ani do DOM — súbor sa balí aj do
  prehliadača a do appky.
*/

export type ZdrojChyby = "server" | "prehliadac" | "appka" | "cron" | "hook";
export type UrovenChyby = "chyba" | "varovanie" | "stare_vydanie";

export const MAX_SPRAVA = 1000;
export const MAX_STACK = 8000;

/* ------------------------------------------------------------ citlivé údaje */

const NAHRADY: [RegExp, string][] = [
  // JWT (prístupové tokeny Supabase, servisný kľúč)
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[token]"],
  // Authorization: Bearer …
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [token]"],
  // Kľúče: Faktero API, Supabase, Resend, Stripe/GoPay štýl, GitHub
  [
    /\b(fk_(?:live|test)_|sb_(?:secret|publishable)_|re_|sk_(?:live|test)_|ghp_|gho_)[A-Za-z0-9_-]{8,}/g,
    "[kľúč]",
  ],
  // Token Telegram bota (123456789:AA…)
  [/\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/g, "[kľúč]"],
  // Parametre a polia s tajomstvom: heslo=…, "password":"…", token=…
  [
    /\b((?:pass(?:word)?|heslo|secret|tajomstvo|token|access_token|refresh_token|api_?key|apikey|client_secret|otp|pin|authorization|cookie)["']?\s*[:=]\s*["']?)[^"'&\s,;}]{1,}/gi,
    "$1[skryté]",
  ],
  // E-maily
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[e-mail]"],
  // IBAN (SK/CZ a ostatné)
  [/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g, "[IBAN]"],
  // Rodné číslo
  [/\b\d{6}\/\d{3,4}\b/g, "[RČ]"],
  // Číslo karty (13–19 číslic, aj s medzerami/pomlčkami)
  [/\b(?:\d[ -]?){12,18}\d\b/g, "[číslo]"],
  // Dlhé náhodné reťazce (tajné kľúče bez známej predpony)
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{40,}\b/g, "[skryté]"],
];

/** Odstráni z textu tokeny, kľúče, heslá, e-maily, IBAN, RČ a orezaný ho vráti. */
export function bezTajomstiev(text: unknown, max = MAX_SPRAVA): string {
  let s = String(text ?? "");
  // Predčasné orezanie — regulárne výrazy nad megabajtom by brzdili.
  if (s.length > max * 4) s = s.slice(0, max * 4);
  for (const [vzor, nahrada] of NAHRADY) s = s.replace(vzor, nahrada);
  // Riadiace znaky okrem nového riadku a tabulátora preč.
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Cesta bez query a fragmentu — v query býva token, e-mail, kód z odkazu. */
export function cistaTrasa(url: unknown): string | null {
  if (url == null) return null;
  const s = String(url).trim();
  if (!s) return null;
  let cesta = s;
  try {
    const u = new URL(s, "http://x");
    cesta = u.pathname;
  } catch {
    cesta = s.split(/[?#]/)[0];
  }
  // Tokeny v ceste (/ponuka/<token>, /aktivacia-efaktury/<token>) skryje bezTajomstiev
  // len keď sú dlhé — kratšie identifikátory nevadia, pomáhajú pri ladení.
  return bezTajomstiev(cesta, 500);
}

/* ------------------------------------------------------------ odtlačok */

/** Správa bez premenlivých častí — čísla, identifikátory, texty v úvodzovkách. */
export function normalizujSpravu(sprava: string): string {
  return sprava
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/"[^"]{0,200}"|'[^']{0,200}'|`[^`]{0,200}`/g, "<s>")
    .replace(/\b0x[0-9a-f]+\b/gi, "<n>")
    .replace(/\d+([.,]\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/**
 * Prvý rámec zo stacku, ktorý ukazuje do nášho kódu — bez čísel riadkov a
 * hashov v menách súborov (po každom vydaní sú iné, chyba je stále tá istá).
 */
export function miestoZoStacku(stack: unknown): string {
  const riadky = String(stack ?? "")
    .split("\n")
    .map((r) => r.trim())
    .filter((r) => /^at\s|@/.test(r));
  const nas = riadky.find((r) => !/node_modules|node:internal|<anonymous>|\(native\)/.test(r));
  const r = nas ?? riadky[0] ?? "";
  return r
    .replace(/https?:\/\/[^/\s)]+/g, "")
    .replace(/[?#][^\s):]*/g, "")
    .replace(/[-.][A-Za-z0-9_-]{8}(?=\.m?js)/g, "")
    .replace(/:\d+(:\d+)?/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 200);
}

/** cyrb53 — rýchly nekryptografický hash, rovnaký v prehliadači aj na serveri. */
function cyrb53(s: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/**
 * Odtlačok chyby. `kde` je doplnkové miesto (meno server funkcie, cesta hooku),
 * keď stack nehovorí nič (minifikovaný kód, chyba bez stacku).
 */
export function odtlacokChyby(v: {
  zdroj: ZdrojChyby;
  uroven?: UrovenChyby;
  sprava: string;
  stack?: string | null;
  kde?: string | null;
}): string {
  const kluc = [
    v.zdroj,
    v.uroven ?? "chyba",
    normalizujSpravu(v.sprava),
    miestoZoStacku(v.stack),
    (v.kde ?? "").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "<id>"),
  ].join("|");
  return cyrb53(kluc, 1) + cyrb53(kluc, 2);
}

/* ------------------------------------------------------------ šum z prehliadača */

/** Chyba, ktorú spôsobilo nové vydanie — starý kód sa pýta na kúsok, ktorý už neexistuje. */
export function jeStareVydanie(sprava: string): boolean {
  return /ChunkLoadError|Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|'text\/html' is not a valid JavaScript MIME type/i.test(
    sprava,
  );
}

/**
 * Šum, ktorý nie je chybou Faktera: rozšírenia prehliadača, ResizeObserver,
 * zrušené požiadavky, výpadok siete, chyby cudzích skriptov bez detailu.
 */
export function jeSumPrehliadaca(v: {
  sprava: string;
  stack?: string | null;
  subor?: string | null;
}): boolean {
  const s = v.sprava ?? "";
  const kde = `${v.stack ?? ""}\n${v.subor ?? ""}`;
  if (/(chrome|moz|safari|safari-web|ms-browser)-extension:\/\//i.test(kde)) return true;
  if (/^ResizeObserver loop/i.test(s)) return true;
  if (/^Script error\.?$/i.test(s.trim())) return true;
  if (
    /AbortError|The user aborted a request|signal is aborted|The operation was aborted|aborted without reason|Fetch is aborted/i.test(
      s,
    )
  )
    return true;
  if (
    /^(TypeError: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?|Network request failed)$/i.test(
      s.trim(),
    )
  )
    return true;
  if (
    /Non-Error promise rejection captured|__gCrWeb|instantSearchSDKJSBridge|webkit\.messageHandlers/i.test(
      s,
    )
  )
    return true;
  if (!s.trim() && !v.stack) return true;
  return false;
}

/* ------------------------------------------------------------ strop zápisov */

/**
 * Strop zápisov v jednom procese:
 * - najviac `zaMinutu` zápisov za minútu na kľúč (zdroj) — chyba v slučke
 *   nezahltí databázu ani nevytlačí ostatné zdroje;
 * - ten istý odtlačok najviac raz za `oknoOdtlacku` ms — ďalšie výskyty sa len
 *   prirátajú a pošlú s najbližším zápisom (počet je preto dolná hranica).
 */
export class StropZapisov {
  private minuta = new Map<string, { od: number; pocet: number }>();
  private odtlacky = new Map<string, { posledny: number; odlozene: number }>();
  constructor(
    readonly zaMinutu = 60,
    readonly oknoOdtlacku = 10_000,
    private teraz: () => number = () => Date.now(),
  ) {}

  /** Koľko výskytov zapísať teraz, alebo `null`, keď sa teraz nezapisuje. */
  pust(kluc: string, odtlacok: string): number | null {
    const t = this.teraz();
    const o = this.odtlacky.get(odtlacok);
    if (o && t - o.posledny < this.oknoOdtlacku) {
      o.odlozene++;
      return null;
    }
    const m = this.minuta.get(kluc);
    if (m && t - m.od < 60_000 && m.pocet >= this.zaMinutu) {
      if (o) o.odlozene++;
      else this.odtlacky.set(odtlacok, { posledny: 0, odlozene: 1 });
      return null;
    }
    if (!m || t - m.od >= 60_000) this.minuta.set(kluc, { od: t, pocet: 1 });
    else m.pocet++;
    const pocet = 1 + (o?.odlozene ?? 0);
    this.odtlacky.set(odtlacok, { posledny: t, odlozene: 0 });
    if (this.odtlacky.size > 2000) this.uprac(t);
    return pocet;
  }

  private uprac(t: number) {
    for (const [k, o] of this.odtlacky)
      if (t - o.posledny > this.oknoOdtlacku * 6) this.odtlacky.delete(k);
  }
}

/** Posuvné okno pokusov na kľúč — limit verejného endpointu podľa IP a odtlačku. */
export class OknoPokusov {
  private zaznamy = new Map<string, number[]>();
  constructor(
    readonly max: number,
    readonly oknoMs: number,
    private teraz: () => number = () => Date.now(),
  ) {}

  skus(kluc: string): boolean {
    const t = this.teraz();
    const od = t - this.oknoMs;
    const casy = (this.zaznamy.get(kluc) ?? []).filter((c) => c > od);
    if (casy.length >= this.max) {
      this.zaznamy.set(kluc, casy);
      return false;
    }
    casy.push(t);
    this.zaznamy.set(kluc, casy);
    if (this.zaznamy.size > 5000)
      for (const [k, c] of this.zaznamy) if (!c.some((x) => x > od)) this.zaznamy.delete(k);
    return true;
  }
}

/* ------------------------------------------------------------ chyba → text */

/** Správa a stack jednej chyby bez príčiny. */
function rozoberJednu(e: unknown): { sprava: string; stack: string | null; meno: string | null } {
  if (e instanceof Error) {
    const meno = e.name && e.name !== "Error" ? e.name : null;
    return {
      sprava:
        meno && !e.message.startsWith(meno)
          ? `${meno}: ${e.message}`
          : e.message || meno || "Error",
      stack: e.stack ?? null,
      meno: e.name ?? null,
    };
  }
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; stack?: unknown; name?: unknown };
    if (typeof o.message === "string")
      return {
        sprava: o.message,
        stack: typeof o.stack === "string" ? o.stack : null,
        meno: typeof o.name === "string" ? o.name : null,
      };
    try {
      return { sprava: JSON.stringify(e).slice(0, MAX_SPRAVA), stack: null, meno: null };
    } catch {
      return { sprava: String(e), stack: null, meno: null };
    }
  }
  return { sprava: String(e ?? "(prázdna chyba)"), stack: null, meno: null };
}

/**
 * Obal, ktorým React hlási chybu, z ktorej sa sám zotavil (#418–#425
 * hydratácia, #520 súbežné kreslenie). Skutočná chyba je v `cause` — bez nej
 * je hlásenie nepoužiteľné („Minified React error #520“ a stack Reactu).
 */
export function jeObalReactu(sprava: string): boolean {
  return /Minified React error #(41[89]|42[0-5]|520)\b|React was able to recover|error while hydrating|Hydration failed/i.test(
    sprava,
  );
}

/**
 * Správa a stack z čohokoľvek, čo sa dá hodiť. Príčina (`cause`) sa pripojí:
 * do stacku celá (skrátená), do správy len pri obale Reactu — tam je správa
 * obalu všade rovnaká a o chybe nehovorí nič.
 */
export function rozoberChybu(e: unknown): {
  sprava: string;
  stack: string | null;
  meno: string | null;
} {
  const hlavna = rozoberJednu(e);
  const pricina =
    e && typeof e === "object" && "cause" in e && (e as { cause?: unknown }).cause != null
      ? rozoberJednu((e as { cause?: unknown }).cause)
      : null;
  if (!pricina) return hlavna;
  const riadky = (s: string, n: number) => s.split("\n").slice(0, n).join("\n");
  // V8 začína stack riadkom „Meno: správa“, Firefox a Safari rovno rámcami.
  const ramce = (pricina.stack ?? "").split("\n").filter((r) => /^\s*at\s|@/.test(r));
  const stackPriciny = [pricina.sprava, ...ramce.slice(0, 11)].join("\n");
  return {
    sprava: jeObalReactu(hlavna.sprava)
      ? `${hlavna.sprava.replace(/;? ?visit https:\/\/react\.dev\S*.*$/i, "")} — príčina: ${pricina.sprava}`
      : hlavna.sprava,
    stack: `${riadky(hlavna.stack ?? hlavna.sprava, 25)}\nCaused by: ${stackPriciny}`.trim(),
    meno: hlavna.meno,
  };
}

/** Vyčistí stack: bez tajomstiev, bez query v adresách, najviac 40 rámcov. */
export function cistyStack(stack: unknown): string | null {
  if (!stack) return null;
  const s = String(stack)
    .split("\n")
    .slice(0, 41)
    .map((r) => r.replace(/(https?:\/\/[^\s)?#]+)[?#][^\s):]*/g, "$1"))
    .join("\n");
  return bezTajomstiev(s, MAX_STACK) || null;
}
