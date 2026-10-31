/**
 * Spoločné čítanie dokladov z Pohoda XML (import vydaných aj prijatých).
 *
 * Export Faktera a import z Pohody musia hovoriť tým istým jazykom: sadzba
 * podľa priehradky a dňa plnenia, kurz v zápise kurzového lístka verzie
 * Pohody (SK: cudzia mena za 1 €, CZ: koruny za `amount` jednotiek) a kódy
 * zaúčtovania (`accounting`, `classificationVAT`, `classificationKVDPH`).
 * Spätný chod (export → import) overuje `pohoda-spatny-chod.test.ts`.
 */
import { krajinaDane, najblizsiaSadzba, sadzbyKuDnu, type KrajinaDane } from "./vat-rates";

export function textUzla(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const t = (v as any)["#text"];
    return t == null ? "" : String(t).trim();
  }
  return String(v).trim();
}

export function uzolPohody(o: any, ...cesta: string[]): any {
  let cur = o;
  for (const k of cesta) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = Array.isArray(cur) ? cur[0]?.[k] : cur[k];
  }
  return cur;
}

export function hodnotaPohody(o: any, ...cesta: string[]): string {
  return textUzla(uzolPohody(o, ...cesta));
}

export function zoznamPohody(v: any): any[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Číslo zo zápisu Pohody (bodka, prípadne čiarka); prázdne = null. */
export function cisloPohody(v: unknown): number | null {
  const s = textUzla(v).replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Skratka z odkazu `<x><typ:ids>KOD</typ:ids></x>`. */
export function kodPohody(o: any, element: string): string {
  return hodnotaPohody(o, element, "ids");
}

/**
 * Sadzba položky z Pohody.
 *
 * Pohoda nesie priehradku (`high`/`low`/`third`/`none`, `history*`), percento
 * si domýšľa podľa dňa plnenia a krajiny. Keď je v súbore `percentVAT`, platí
 * ono. Inak sa z priehradky vezme sadzba platná v deň plnenia a overí sa
 * sumami — keď nesedí (historická sadzba, iný štát pri OSS), rozhodnú sumy
 * prilepené k najbližšej známej sadzbe. Holý podiel daň/základ zaokrúhlený na
 * celé percento by pri malých sumách vyšiel zle (0,04 € + 0,01 € = „25 %“).
 */
export function sadzbaZPohody(opts: {
  kod: string;
  zaklad: number | null;
  dan: number | null;
  percento?: number | null;
  krajina?: string | null;
  den?: string | null;
}): number {
  if (opts.percento != null && Number.isFinite(opts.percento)) return opts.percento;
  const k: KrajinaDane = krajinaDane(opts.krajina);
  const tab = sadzbyKuDnu(k, opts.den || undefined);
  const kod = String(opts.kod ?? "").toLowerCase();
  const zPriehradky =
    kod === "none"
      ? 0
      : kod === "high"
        ? tab.high
        : kod === "low"
          ? tab.low
          : kod === "third"
            ? tab.third
            : null;
  const zaklad = Number(opts.zaklad ?? 0);
  const dan = Number(opts.dan ?? 0);
  if (zaklad && opts.dan != null) {
    if (
      zPriehradky != null &&
      Math.abs((zaklad * zPriehradky) / 100 - dan) <= 0.011 + Math.abs(zaklad) * 1e-6
    )
      return zPriehradky;
    /*
      Nulová daň pri priehradke so sadzbou je prenesenie daňovej povinnosti —
      sadzba ostáva (KV A.2 / samozdanenie ju potrebuje), daň je nula a nesie
      ju `priceVAT`, nie výpočet zo sadzby.
    */
    if (Math.abs(dan) < 0.005) return zPriehradky ?? 0;
    return najblizsiaSadzba((dan / zaklad) * 100, k);
  }
  if (zPriehradky != null) return zPriehradky;
  // history* bez súm — najbližšia historická podľa názvu priehradky.
  if (kod === "historyhigh") return k === "CZ" ? 21 : 20;
  if (kod === "historylow") return k === "CZ" ? 15 : 10;
  if (kod === "historythird") return 10;
  return 0;
}

/**
 * Kurz z `foreignCurrency` v zápise Faktera.
 *
 *  - SK Pohoda: `rate` = cudzia mena za `amount` € (ECB, amount 1) → kurz
 *    dokladu Faktera je cudzia mena za 1 €.
 *  - CZ Pohoda: `rate` = koruny za `amount` jednotiek meny (ČNB) → kurz
 *    Faktera je koruny za 1 jednotku.
 * V oboch prípadoch je to `rate / amount` — opak `kurzPrePohodu`.
 */
export function kurzZPohody(rate: unknown, amount: unknown): number | null {
  const r = cisloPohody(rate);
  const a = cisloPohody(amount) ?? 1;
  if (!r || r <= 0 || !a || a <= 0) return null;
  return Math.round((r / a) * 1e8) / 1e8;
}

/** Je XML z českej Pohody? Opravný daňový doklad a dátum pre KH má len CZ verzia. */
export function jeCeskaPohoda(xml: string): boolean {
  return /CorrectiveTax|dateKHDPH/.test(xml);
}

/** Predkontácia „Rozúčtovať“ nie je kód — kódy sú na položkách. */
export function predkontaciaZPohody(kod: string): string | null {
  const k = String(kod ?? "").trim();
  if (!k || /^roz[uú][cč]tova/i.test(k)) return null;
  return k;
}

/** Riadok KV z Pohody (A1, B2…) — prázdny alebo neznámy = null. */
export function kvZPohody(kod: string): string | null {
  const k = String(kod ?? "")
    .trim()
    .toUpperCase()
    .replace(/[.\s]/g, "");
  return /^(A1|A2|B1|B2|B3|C1|C2|D1|D2)$/.test(k) ? k : null;
}

/** Členenie DPH pre prenesenie daňovej povinnosti (SK UDpdp/PDpdp, CZ …pdp / §92a). */
export function jeClenenieVPreneseni(kod: string): boolean {
  return /pdp|92a|prenes/i.test(String(kod ?? ""));
}
