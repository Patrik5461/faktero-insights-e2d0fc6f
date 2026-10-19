/**
 * Jazyk webu (SK / CZ / DE).
 *
 * Kľúčom prekladu je **samotný slovenský text** — `t("Vystavené faktúry")`.
 * Nepreložený text tak ostane po slovensky a nič sa nerozbije; preklad sa dá
 * dopĺňať postupne. Slovníky sú v `src/lib/i18n/de/*.ts` a `src/lib/i18n/cs/*.ts`
 * (jeden súbor na oblasť webu, v `cs/` s rovnakými kľúčmi ako v `de/`), načítajú sa naraz cez `import.meta.glob`, takže pridanie
 * súboru nevyžaduje úpravu žiadneho zoznamu.
 *
 * Voľba jazyka je v cookie, aby server vykreslil stránku hneď v správnom
 * jazyku (bez bliknutia slovenčiny). Neskôr sa doplní aj do nastavení firmy.
 */
export type Jazyk = "sk" | "cs" | "de";
/*
  Poradie SK, CZ, DE: Faktero je pre slovenské a české firmy, nemčina je
  doplnok pre firmy z Nemecka a Rakúska. Skratka je „CZ“ (krajina, ako ju
  ľudia poznajú), kód jazyka ostáva ISO „cs“ — ide do `<html lang>` aj cookie.
*/
export const JAZYKY: { kod: Jazyk; nazov: string; skratka: string }[] = [
  { kod: "sk", nazov: "Slovenčina", skratka: "SK" },
  { kod: "cs", nazov: "Čeština", skratka: "CZ" },
  { kod: "de", nazov: "Deutsch", skratka: "DE" },
];
export const COOKIE_JAZYKA = "faktero_jazyk";

export const jeJazyk = (v: unknown): v is Jazyk => v === "sk" || v === "cs" || v === "de";

const LOKALY = { sk: "sk-SK", cs: "cs-CZ", de: "de-DE" } as const;

/**
 * Locale na `toLocaleString`/`Intl` podľa jazyka webu. Nikdy nepíš
 * `jazyk === "de" ? "de-DE" : "sk-SK"` — tretí jazyk by tak skončil v slovenčine.
 */
export function lokalJazyka(jazyk: Jazyk | string | null | undefined): (typeof LOKALY)[Jazyk] {
  return jeJazyk(jazyk) ? LOKALY[jazyk] : "sk-SK";
}

/** Jazyk z hodnoty hlavičky Cookie; čítanie požiadavky je v `zisti-jazyk.ts`. */
export function jazykZCookie(cookie: string | null | undefined): Jazyk {
  const m = (cookie ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE_JAZYKA}=([a-z]{2})`));
  return m && jeJazyk(m[1]) ? m[1] : "sk";
}

/** Uloží voľbu na rok a načíta stránku znova — prekreslí sa všetko vrátane servera. */
export function nastavJazyk(j: Jazyk) {
  document.cookie = `${COOKIE_JAZYKA}=${j}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}

type Slovnik = Record<string, string>;

/*
  Glob na neexistujúci priečinok vráti prázdny objekt (Vite aj vitest), takže
  jazyk bez slovníkov ostane po slovensky a nič nepadne.
*/
const modulyDe = import.meta.glob<Slovnik>("./de/*.ts", { eager: true, import: "default" });
const modulyCs = import.meta.glob<Slovnik>("./cs/*.ts", { eager: true, import: "default" });
const SLOVNIKY: Record<Exclude<Jazyk, "sk">, Slovnik> = {
  de: Object.assign({}, ...Object.values(modulyDe)),
  cs: Object.assign({}, ...Object.values(modulyCs)),
};

/**
 * Text v danom jazyku; `{meno}` sa nahradí hodnotou z `p`.
 *
 * Kontext: to isté slovenské slovo môže mať v nemčine dva preklady
 * („Prijaté“ = pozvánka „Angenommen“ aj pošta „Eingänge“). Vtedy sa kľúč
 * napíše s kontextom `"pozvanka::Prijaté"` — slovensky sa ukáže časť za `::`,
 * v slovníku je kľúč celý. Bez kontextového prekladu sa skúsi holé slovo.
 */
export function preloz(jazyk: Jazyk, text: string, p?: Record<string, string | number>): string {
  const i = text.indexOf("::");
  const holy = i > 0 ? text.slice(i + 2) : text;
  const slovnik = jazyk === "sk" ? undefined : SLOVNIKY[jazyk];
  let s = slovnik ? (slovnik[text] ?? slovnik[holy] ?? holy) : holy;
  if (p) for (const [k, v] of Object.entries(p)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Počet slovníkových položiek — na kontrolu v testoch a diagnostike. */
export const pocetPrekladov = (jazyk: Exclude<Jazyk, "sk"> = "de") =>
  Object.keys(SLOVNIKY[jazyk]).length;

/** Celý slovník jazyka — len na kontroly v testoch. */
export const slovnikJazyka = (jazyk: Exclude<Jazyk, "sk">): Readonly<Slovnik> => SLOVNIKY[jazyk];
