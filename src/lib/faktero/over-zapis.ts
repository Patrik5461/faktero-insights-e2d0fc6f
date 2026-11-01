/*
  Zápis pod RLS, ktorý naozaj niečo zapísal.

  PostgREST pri `update`/`delete`, ktorý RLS nepustí, NEVRÁTI chybu — len
  nula riadkov. Bez `.select()` sa to nedá ani zistiť, a stránka hlási
  „Uložené“ / „Zmazané“, hoci sa nestalo nič (S-13 /firma, J-14 Kniha jázd).

  Použitie:
    const riadky = overZapis(
      await supabase.from("trips").delete().eq("id", id).select("id"),
    );
  alebo skrátene:
    await zapisOverene(supabase.from("trips").update(patch).eq("id", id).select("id"));

  Pri nule riadkov vyhodí `ChybaZapisu` s textom TEXT_BEZ_OPRAVNENIA (kľúč
  pre `t()` — preklad je v slovníku opravy-krok0). Pri hromadnom zápise
  `ocakavane` povie, koľko riadkov sa malo zmeniť.
*/

export const TEXT_BEZ_OPRAVNENIA =
  "Zmena sa neuložila — nemáte na ňu oprávnenie alebo záznam už neexistuje.";
export const TEXT_CIASTOCNE = "Zmenilo sa len {n} z {spolu} záznamov — na ostatné nemáte oprávnenie.";

export type DruhChybyZapisu = "bez-opravnenia" | "ciastocne" | "databaza" | "bez-select";

export class ChybaZapisu extends Error {
  readonly druh: DruhChybyZapisu;
  /** Koľko riadkov sa zapísalo (pri `ciastocne`). */
  readonly zapisane: number;
  readonly povodna?: unknown;
  constructor(druh: DruhChybyZapisu, sprava: string, zapisane = 0, povodna?: unknown) {
    super(sprava);
    this.name = "ChybaZapisu";
    this.druh = druh;
    this.zapisane = zapisane;
    this.povodna = povodna;
  }
}

type Odpoved<T> = {
  data: T[] | T | null;
  error: { message?: string } | null;
  status?: number;
  count?: number | null;
};

/**
 * Overí odpoveď zápisu a vráti zapísané riadky. Dotaz MUSÍ mať `.select(…)` —
 * bez neho odpoveď o počte riadkov nič nehovorí a vyhodí sa vývojárska chyba.
 */
export function overZapis<T>(odpoved: Odpoved<T>, o: { ocakavane?: number } = {}): T[] {
  if (odpoved.error) {
    throw new ChybaZapisu(
      "databaza",
      odpoved.error.message || "Zápis do databázy zlyhal.",
      0,
      odpoved.error,
    );
  }
  if (odpoved.data === null && odpoved.status === 204) {
    throw new ChybaZapisu(
      "bez-select",
      "overZapis: dotaz potrebuje .select(\"id\"), inak sa nedá zistiť, či RLS zápis pustila.",
    );
  }
  const riadky = odpoved.data == null ? [] : Array.isArray(odpoved.data) ? odpoved.data : [odpoved.data];
  if (riadky.length === 0) throw new ChybaZapisu("bez-opravnenia", TEXT_BEZ_OPRAVNENIA);
  if (o.ocakavane !== undefined && riadky.length < o.ocakavane) {
    throw new ChybaZapisu(
      "ciastocne",
      TEXT_CIASTOCNE.replace("{n}", String(riadky.length)).replace("{spolu}", String(o.ocakavane)),
      riadky.length,
    );
  }
  return riadky;
}

/** `overZapis(await dotaz)` v jednom kroku. */
export async function zapisOverene<T>(
  dotaz: PromiseLike<Odpoved<T>>,
  o: { ocakavane?: number } = {},
): Promise<T[]> {
  return overZapis(await dotaz, o);
}

/**
 * Text chyby pre toast — pri `ChybaZapisu` preložiteľný, inak správa výnimky.
 * `t` je `useT().t`; pri `ciastocne` sa doplnia čísla.
 */
export function textChybyZapisu(e: unknown, t: (s: string, p?: Record<string, string | number>) => string = (s, p) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(p?.[k] ?? `{${k}}`)),
): string {
  if (e instanceof ChybaZapisu) {
    if (e.druh === "bez-opravnenia") return t(TEXT_BEZ_OPRAVNENIA);
    if (e.druh === "ciastocne") {
      const m = /(\d+) z (\d+)/.exec(e.message);
      return t(TEXT_CIASTOCNE, { n: m?.[1] ?? e.zapisane, spolu: m?.[2] ?? "?" });
    }
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
