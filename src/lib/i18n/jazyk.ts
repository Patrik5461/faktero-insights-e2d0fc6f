/**
 * Jazyk webu (SK / CZ / DE).
 *
 * Kľúčom prekladu je **samotný slovenský text** — `t("Vystavené faktúry")`.
 * Nepreložený text tak ostane po slovensky a nič sa nerozbije; preklad sa dá
 * dopĺňať postupne. Slovníky sú v `src/lib/i18n/de/*.ts` a `src/lib/i18n/cs/*.ts`
 * (jeden súbor na oblasť webu, v `cs/` s rovnakými kľúčmi ako v `de/`), spája ich `slovnik-de.ts`/`slovnik-cs.ts`
 * cez `import.meta.glob`, takže pridanie súboru nevyžaduje úpravu žiadneho zoznamu. Načítavajú sa
 * až na požiadanie (`nacitajSlovnik`).
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
  // `?lang=` v adrese by cookie prebil — pri ručnej voľbe ho treba zahodiť.
  const u = new URL(window.location.href);
  if (u.searchParams.has("lang")) {
    u.searchParams.delete("lang");
    window.location.replace(u.toString());
  } else window.location.reload();
}

type Slovnik = Record<string, string>;

/*
  Slovníky sa načítavajú až keď treba, každý jazyk ako jeden kúsok kódu
  (`slovnik-de.ts`, `slovnik-cs.ts`). Kedysi boli priamo tu cez eager glob —
  3,6 MB textu v hlavnom skripte, ktorý si sťahoval aj každý slovenský
  návštevník a telefón ho parsoval niekoľko sekúnd pred prvou interakciou.

  Kto ich načíta:
  - koreňová trasa v `beforeLoad` (server aj navigácia v prehliadači),
  - `hydrate` v `router.tsx` pred hydratáciou (podľa `<html lang>`), aby
    prvé kreslenie v prehliadači sedelo so serverom,
  - serverové funkcie mimo trás (webhooky, UStVA) samy pred prvým `preloz`.
  Kým slovník nie je načítaný, `preloz` vráti slovenský text — nič nespadne.
*/
const SLOVNIKY: Partial<Record<Exclude<Jazyk, "sk">, Slovnik>> = {};
const NACITAVANIE: Partial<Record<Exclude<Jazyk, "sk">, Promise<void>>> = {};
const ZDROJE: Record<Exclude<Jazyk, "sk">, () => Promise<{ default: Slovnik }>> = {
  de: () => import("./slovnik-de"),
  cs: () => import("./slovnik-cs"),
};

/** Načíta slovník jazyka (raz; ďalšie volania vrátia ten istý sľub). */
export function nacitajSlovnik(jazyk: Jazyk | string | null | undefined): Promise<void> {
  if (!jeJazyk(jazyk) || jazyk === "sk") return Promise.resolve();
  if (SLOVNIKY[jazyk]) return Promise.resolve();
  NACITAVANIE[jazyk] ??= ZDROJE[jazyk]()
    .then((m) => {
      SLOVNIKY[jazyk] = m.default;
    })
    .catch((e) => {
      // Ďalší pokus pri ďalšej navigácii; dovtedy ostane slovenčina.
      delete NACITAVANIE[jazyk];
      console.error("[jazyk] slovník sa nenačítal", jazyk, e);
    });
  return NACITAVANIE[jazyk]!;
}

/** Oba slovníky — server pri štarte a testy. */
export const nacitajVsetkySlovniky = () =>
  Promise.all([nacitajSlovnik("de"), nacitajSlovnik("cs")]).then(() => undefined);

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
  Object.keys(SLOVNIKY[jazyk] ?? {}).length;

/** Celý slovník jazyka — len na kontroly v testoch. */
export const slovnikJazyka = (jazyk: Exclude<Jazyk, "sk">): Readonly<Slovnik> =>
  SLOVNIKY[jazyk] ?? {};
