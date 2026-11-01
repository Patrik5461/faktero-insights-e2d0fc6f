/**
 * Predaj spotrebiteľom do EÚ v režime OSS.
 *
 * Priznanie k jednému kontaktnému miestu sa podáva za kalendárny štvrťrok a
 * člení sa podľa štátu spotreby a sadzby dane. Sleduje sa aj hranica
 * 10 000 eur za rok: do jej prekročenia sa predaj zdaňuje doma, po prekročení
 * sadzbou štátu zákazníka (§ 68a zákona o DPH).
 */

import { statEu, stavPrahu } from "./sadzby-eu";
import { domacaMena, domacejZaJednotku } from "./kurzy";

/** Výtka pre doklad, ktorý sa nedá vyjadriť v eurách. */
export const VYTKA_BEZ_KURZU_OSS =
  "Doklad je v cudzej mene a nemá kurz na prepočet do eur — v priznaní ani v ročnej hranici nie je. Otvorte ho a uložte znova.";

/**
 * Koľko eur za 1 jednotku meny faktúry — OSS a hranica 10 000 € sú vždy v
 * eurách. Euro = 1; SK/DE firma prepočíta kurzom ECB z dokladu
 * (`exchange_rate` = mena za 1 EUR). CZ firma má na doklade kurz ČNB
 * (CZK za jednotku), z ktorého sa eurá nedajú vyčítať → `null`, rovnako
 * cudzia mena bez kurzu. Nikdy sa nehádá kurz 1.
 */
export function eurZaJednotkuOss(
  f: { currency?: string | null; exchange_rate?: unknown },
  country: string | null | undefined,
): number | null {
  const mena =
    String(f.currency ?? "")
      .trim()
      .toUpperCase() || domacaMena(country);
  if (mena === "EUR") return 1;
  if (domacaMena(country) !== "EUR") return null;
  const k = domacejZaJednotku(f.exchange_rate, country);
  return k > 0 ? k : null;
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
    .sort((a, b) => a.stat.localeCompare(b.stat) || b.sadzba - a.sadzba);

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
