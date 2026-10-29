/**
 * Uloženie výsledku automatickej kontroly k prijatej eFaktúre.
 *
 * Každá prijatá eFaktúra sa pri príjme skontroluje (`skontrolujEfakturu`) a
 * výsledok sa zapíše do stĺpcov `kontrola_*` v `efaktura_received_documents`.
 * Kontrola príjem nikdy nezastaví — chybná eFaktúra sa prijme a len označí,
 * a keď spadne samotná kontrola, stĺpce ostanú prázdne (= neskontrolované).
 *
 * Čistý TypeScript bez závislostí na serveri — tvar čítajú aj stránky.
 */
import { skontrolujEfakturu, type NalezKontroly, type VysledokKontroly } from "./index";
import type { Oblast, Zavaznost } from "./pravidla";

/** Zvýši sa, keď sa zmení tvar uloženého výsledku. */
export const VERZIA_ULOZENEJ_KONTROLY = 1;

/** Viac nálezov sa k dokladu neuloží — počty ostanú úplné. */
export const MAX_ULOZENYCH_NALEZOV = 200;

/** Parametre nálezu môžu niesť kus zo súboru — dlhý text sa skráti. */
const MAX_DLZKA_PARAMETRA = 300;

export type UlozenyNalez = {
  kod: string;
  zavaznost: Zavaznost;
  oblast: Oblast;
  /** Slovenský popis so `{x}` — kľúč prekladu, doplní sa z `parametre`. */
  popis: string;
  parametre: Record<string, string | number>;
  kategoria?: string;
  cesta?: string;
  riadok?: number;
  stlpec?: number;
};

export type UlozenaKontrola = {
  verzia: number;
  platny: boolean;
  pocetChyb: number;
  pocetVarovani: number;
  pocetPravidiel: number;
  nalezy: UlozenyNalez[];
  /** Koľko nálezov sa pre strop neuložilo. */
  orezane: number;
};

/** Stĺpce `efaktura_received_documents`, do ktorých ide výsledok. */
export type StlpceKontroly = {
  kontrola_vysledok: UlozenaKontrola;
  kontrola_chyby: number;
  kontrola_varovania: number;
  skontrolovane_at: string;
};

function skratParametre(p: Record<string, string | number>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(p ?? {})) {
    out[k] =
      typeof v === "string" && v.length > MAX_DLZKA_PARAMETRA
        ? v.slice(0, MAX_DLZKA_PARAMETRA) + "…"
        : v;
  }
  return out;
}

function ulozNalez(n: NalezKontroly): UlozenyNalez {
  const u: UlozenyNalez = {
    kod: n.kod,
    zavaznost: n.zavaznost,
    oblast: n.oblast,
    popis: n.popis,
    parametre: skratParametre(n.parametre),
  };
  if (n.kategoria) u.kategoria = n.kategoria;
  if (n.cesta) u.cesta = n.cesta;
  if (n.riadok != null) u.riadok = n.riadok;
  if (n.stlpec != null) u.stlpec = n.stlpec;
  return u;
}

/** Výsledok kontroly v tvare na zápis k dokladu. */
export function stlpceKontroly(
  v: VysledokKontroly,
  teraz: Date = new Date(),
  maxNalezov: number = MAX_ULOZENYCH_NALEZOV,
): StlpceKontroly {
  // Nálezy sú zoradené chyby pred varovaniami, takže strop uberie najprv varovania.
  const nalezy = v.nalezy.slice(0, maxNalezov).map(ulozNalez);
  return {
    kontrola_vysledok: {
      verzia: VERZIA_ULOZENEJ_KONTROLY,
      platny: v.platny,
      pocetChyb: v.pocetChyb,
      pocetVarovani: v.pocetVarovani,
      pocetPravidiel: v.pocetPravidiel,
      nalezy,
      orezane: v.nalezy.length - nalezy.length,
    },
    kontrola_chyby: v.pocetChyb,
    kontrola_varovania: v.pocetVarovani,
    skontrolovane_at: teraz.toISOString(),
  };
}

/**
 * Skontroluje XML a vráti stĺpce na zápis. Keď kontrola spadne, vráti `null`
 * a chybu len zapíše do logu — príjem dokladu musí pokračovať.
 */
export function skontrolujNaUlozenie(
  xml: string,
  teraz: Date = new Date(),
  log: (sprava: string, chyba: unknown) => void = (s, e) => console.error(s, e),
): StlpceKontroly | null {
  try {
    return stlpceKontroly(skontrolujEfakturu(xml), teraz);
  } catch (e) {
    log("[efaktura] automatická kontrola prijatej eFaktúry zlyhala", e);
    return null;
  }
}

/** Uložený výsledok z DB (jsonb) — nečakaný tvar vráti `null`. */
export function nacitajUlozenuKontrolu(json: unknown): UlozenaKontrola | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Partial<UlozenaKontrola>;
  if (!Array.isArray(o.nalezy)) return null;
  const nalezy = o.nalezy.filter(
    (n): n is UlozenyNalez =>
      !!n &&
      typeof n === "object" &&
      typeof (n as UlozenyNalez).kod === "string" &&
      typeof (n as UlozenyNalez).popis === "string" &&
      ((n as UlozenyNalez).zavaznost === "chyba" || (n as UlozenyNalez).zavaznost === "varovanie"),
  );
  const pocetChyb =
    typeof o.pocetChyb === "number"
      ? o.pocetChyb
      : nalezy.filter((n) => n.zavaznost === "chyba").length;
  const pocetVarovani =
    typeof o.pocetVarovani === "number"
      ? o.pocetVarovani
      : nalezy.filter((n) => n.zavaznost === "varovanie").length;
  return {
    verzia: typeof o.verzia === "number" ? o.verzia : VERZIA_ULOZENEJ_KONTROLY,
    platny: pocetChyb === 0,
    pocetChyb,
    pocetVarovani,
    pocetPravidiel: typeof o.pocetPravidiel === "number" ? o.pocetPravidiel : 0,
    nalezy: nalezy.map((n) => ({ ...n, parametre: n.parametre ?? {} })),
    orezane: typeof o.orezane === "number" ? o.orezane : 0,
  };
}

export type StavKontroly = "neskontrolovane" | "ok" | "varovania" | "chyby";

/** Odznak v zozname — z uložených počtov (null = neskontrolované). */
export function zhrnutieKontroly(
  chyby: number | null | undefined,
  varovania: number | null | undefined,
): { stav: StavKontroly; chyby: number; varovania: number } {
  if (chyby == null && varovania == null)
    return { stav: "neskontrolovane", chyby: 0, varovania: 0 };
  const c = Math.max(0, chyby ?? 0);
  const v = Math.max(0, varovania ?? 0);
  return { stav: c > 0 ? "chyby" : v > 0 ? "varovania" : "ok", chyby: c, varovania: v };
}

/** Najčastejšie kódy nálezov (napr. pre súhrn spätnej kontroly). */
export function najcastejsieNalezy(
  kontroly: (UlozenaKontrola | null)[],
  kolko = 10,
): { kod: string; zavaznost: Zavaznost; pocet: number; dokladov: number }[] {
  const m = new Map<
    string,
    { kod: string; zavaznost: Zavaznost; pocet: number; dokladov: number }
  >();
  for (const k of kontroly) {
    if (!k) continue;
    const videne = new Set<string>();
    for (const n of k.nalezy) {
      const z = m.get(n.kod) ?? { kod: n.kod, zavaznost: n.zavaznost, pocet: 0, dokladov: 0 };
      z.pocet += 1;
      if (!videne.has(n.kod)) {
        z.dokladov += 1;
        videne.add(n.kod);
      }
      m.set(n.kod, z);
    }
  }
  return [...m.values()]
    .sort((a, b) => b.dokladov - a.dokladov || b.pocet - a.pocet || a.kod.localeCompare(b.kod))
    .slice(0, kolko);
}
