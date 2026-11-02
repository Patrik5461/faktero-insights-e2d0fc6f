/**
 * Predaj spotrebiteľom do EÚ v režime OSS.
 *
 * Priznanie k jednému kontaktnému miestu sa podáva za kalendárny štvrťrok a
 * člení sa podľa štátu spotreby a sadzby dane. Sleduje sa aj hranica
 * 10 000 eur za rok: do jej prekročenia sa predaj zdaňuje doma, po prekročení
 * sadzbou štátu zákazníka (§ 68a zákona o DPH).
 */

import { statEu, stavPrahu } from "./sadzby-eu";
import { domacaMena } from "./kurzy";
import { porovnajSadzby } from "./vat-rates";

/** Výtka pre doklad, ktorý sa nedá vyjadriť v eurách. */
export const VYTKA_BEZ_KURZU_OSS =
  "Doklad je v cudzej mene a kurz ECB k poslednému dňu štvrťroka sa nepodarilo zistiť — v priznaní ani v ročnej hranici nie je.";

/** Posledný deň kalendárneho štvrťroka, do ktorého patrí dátum (RRRR-MM-DD). */
export function koniecStvrtroka(datum: string): string {
  const { rok, stvrtrok } = stvrtrokDna(datum);
  return new Date(Date.UTC(rok, stvrtrok * 3, 0)).toISOString().slice(0, 10);
}

/** Deň, podľa ktorého doklad patrí do štvrťroka OSS — dodanie, inak vystavenie. */
export function denDokladuOss(f: {
  delivery_date?: string | null;
  issue_date?: string | null;
}): string {
  return String(f.delivery_date || f.issue_date || "").slice(0, 10);
}

/** Mena dokladu; prázdna = domáca mena firmy. */
export function menaDokladuOss(
  f: { currency?: string | null },
  country: string | null | undefined,
): string {
  return (
    String(f.currency ?? "")
      .trim()
      .toUpperCase() || domacaMena(country)
  );
}

/** Kurz ECB („mena za 1 EUR“) ku koncu štvrťroka; kľúč `klucKurzuOss(mena, koniec)`. */
export type KurzyOss = Map<string, { kurz: number; den: string; predbezne: boolean }>;

export function klucKurzuOss(mena: string, koniecStvrtrokuDen: string): string {
  return `${mena.toUpperCase()}|${koniecStvrtrokuDen}`;
}

/** Ktoré kurzy treba na prepočet dokladov (mena × koniec štvrťroka), bez eura. */
export function potrebneKurzyOss(
  doklady: {
    currency?: string | null;
    delivery_date?: string | null;
    issue_date?: string | null;
  }[],
  country: string | null | undefined,
): { mena: string; den: string }[] {
  const von = new Map<string, { mena: string; den: string }>();
  for (const f of doklady) {
    const mena = menaDokladuOss(f, country);
    const datum = denDokladuOss(f);
    if (mena === "EUR" || !datum) continue;
    const den = koniecStvrtroka(datum);
    von.set(klucKurzuOss(mena, den), { mena, den });
  }
  return [...von.values()];
}

/**
 * Koľko eur za 1 jednotku meny faktúry — OSS a hranica 10 000 € sú vždy v
 * eurách. Euro = 1; iná mena (aj koruna českej firmy) sa prepočíta kurzom
 * ECB k poslednému dňu štvrťroka, do ktorého doklad patrí — čl. 366 ods. 1
 * smernice 2006/112/ES („kurz platný v posledný deň obdobia, zverejnený ECB
 * pre ten deň, a ak v ten deň zverejnený nebol, v najbližší nasledujúci deň
 * zverejnenia“). Kurz z dokladu (deň pred dodaním) sa na OSS nepoužije.
 * Bez kurzu → `null`; nikdy sa nehádá kurz 1.
 */
export function eurZaJednotkuOss(
  f: { currency?: string | null; delivery_date?: string | null; issue_date?: string | null },
  country: string | null | undefined,
  kurzy: KurzyOss,
): number | null {
  const mena = menaDokladuOss(f, country);
  if (mena === "EUR") return 1;
  const datum = denDokladuOss(f);
  if (!datum) return null;
  const k = kurzy.get(klucKurzuOss(mena, koniecStvrtroka(datum)));
  return k && k.kurz > 0 ? 1 / k.kurz : null;
}

export type OssDoklad = {
  cislo: string;
  datum: string;
  stat: string;
  /** Dobropis znižuje — do priznania vstupuje so záporným znamienkom. */
  opravny?: boolean;
  riadky: { sadzba: number; zaklad: number; dan: number }[];
};

export type OssRiadok = {
  stat: string;
  nazovStatu: string;
  sadzba: number;
  zaklad: number;
  dan: number;
};

export type OssPrehlad = {
  riadky: OssRiadok[];
  zakladSpolu: number;
  danSpolu: number;
  vytky: { doklad: string; text: string }[];
};

function centy(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function ossPrehlad(doklady: OssDoklad[]): OssPrehlad {
  const mapa = new Map<string, OssRiadok>();
  const vytky: OssPrehlad["vytky"] = [];

  for (const d of doklady) {
    const stat = statEu(d.stat);
    if (!stat) {
      vytky.push({
        doklad: d.cislo,
        text: `Štát spotreby „${d.stat ?? "?"}" nie je členský štát EÚ — do priznania OSS taký doklad nepatrí.`,
      });
      continue;
    }
    /*
      Dobropis je v databáze záporný (formulár) — ten sa už neotáča, inak by
      priznanie OSS zvýšil. Otáča sa len kladne uložený (starší import).
    */
    const sucet = d.riadky.reduce((a, r) => a + r.zaklad, 0);
    const znamienko = d.opravny && sucet > 0 ? -1 : 1;
    for (const r of d.riadky) {
      if (r.zaklad === 0 && r.dan === 0) continue;
      if (r.sadzba <= 0) {
        vytky.push({
          doklad: d.cislo,
          text: "Riadok s nulovou sadzbou — predaj spotrebiteľovi sa zdaňuje sadzbou jeho štátu.",
        });
        continue;
      }
      const kluc = `${stat.kod}|${r.sadzba}`;
      const s = mapa.get(kluc) ?? {
        stat: stat.kod,
        nazovStatu: stat.nazov,
        sadzba: r.sadzba,
        zaklad: 0,
        dan: 0,
      };
      s.zaklad = centy(s.zaklad + znamienko * r.zaklad);
      s.dan = centy(s.dan + znamienko * r.dan);
      mapa.set(kluc, s);
    }
  }

  const riadky = [...mapa.values()]
    .filter((r) => r.zaklad !== 0 || r.dan !== 0)
    .sort((a, b) => a.stat.localeCompare(b.stat) || porovnajSadzby(a.sadzba, b.sadzba));

  return {
    riadky,
    zakladSpolu: centy(riadky.reduce((a, r) => a + r.zaklad, 0)),
    danSpolu: centy(riadky.reduce((a, r) => a + r.dan, 0)),
    vytky,
  };
}

/** Štvrťrok, do ktorého doklad patrí. */
export function stvrtrokDna(datum: string): { rok: number; stvrtrok: number } {
  const [r, m] = String(datum).split("-").map(Number);
  return { rok: r, stvrtrok: Math.floor((m - 1) / 3) + 1 };
}

export { stavPrahu };
