/**
 * Jazyk webu (SK / DE).
 *
 * Kľúčom prekladu je **samotný slovenský text** — `t("Vystavené faktúry")`.
 * Nepreložený text tak ostane po slovensky a nič sa nerozbije; preklad sa dá
 * dopĺňať postupne. Slovníky sú v `src/lib/i18n/de/*.ts` (jeden súbor na
 * oblasť webu), načítajú sa naraz cez `import.meta.glob`, takže pridanie
 * súboru nevyžaduje úpravu žiadneho zoznamu.
 *
 * Voľba jazyka je v cookie, aby server vykreslil stránku hneď v správnom
 * jazyku (bez bliknutia slovenčiny). Neskôr sa doplní aj do nastavení firmy.
 */
import { createIsomorphicFn } from "@tanstack/react-start";

export type Jazyk = "sk" | "de";
export const JAZYKY: { kod: Jazyk; nazov: string; skratka: string }[] = [
  { kod: "sk", nazov: "Slovenčina", skratka: "SK" },
  { kod: "de", nazov: "Deutsch", skratka: "DE" },
];
export const COOKIE_JAZYKA = "faktero_jazyk";

export const jeJazyk = (v: unknown): v is Jazyk => v === "sk" || v === "de";

function zCookie(cookie: string | null | undefined): Jazyk {
  const m = (cookie ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE_JAZYKA}=([a-z]{2})`));
  return m && jeJazyk(m[1]) ? m[1] : "sk";
}

/** Jazyk z cookie — na serveri z požiadavky, v prehliadači z `document.cookie`. */
export const zistiJazyk = createIsomorphicFn()
  .server(async (): Promise<Jazyk> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    return zCookie(getRequestHeader("cookie"));
  })
  .client(async (): Promise<Jazyk> => zCookie(document.cookie));

/** Uloží voľbu na rok a načíta stránku znova — prekreslí sa všetko vrátane servera. */
export function nastavJazyk(j: Jazyk) {
  document.cookie = `${COOKIE_JAZYKA}=${j}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}

type Slovnik = Record<string, string>;

const moduly = import.meta.glob<Slovnik>("./de/*.ts", { eager: true, import: "default" });
const DE: Slovnik = Object.assign({}, ...Object.values(moduly));

/** Text v danom jazyku; `{meno}` sa nahradí hodnotou z `p`. */
export function preloz(jazyk: Jazyk, text: string, p?: Record<string, string | number>): string {
  let s = jazyk === "de" ? (DE[text] ?? text) : text;
  if (p) for (const [k, v] of Object.entries(p)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Počet slovníkových položiek — na kontrolu v testoch a diagnostike. */
export const pocetPrekladov = () => Object.keys(DE).length;
