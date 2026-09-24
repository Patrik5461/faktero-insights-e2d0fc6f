/**
 * Predaj spotrebiteľom do EÚ v režime OSS.
 *
 * Priznanie k jednému kontaktnému miestu sa podáva za kalendárny štvrťrok a
 * člení sa podľa štátu spotreby a sadzby dane. Sleduje sa aj hranica
 * 10 000 eur za rok: do jej prekročenia sa predaj zdaňuje doma, po prekročení
 * sadzbou štátu zákazníka (§ 68a zákona o DPH).
 */

import { statEu, stavPrahu } from "./sadzby-eu";

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
    const znamienko = d.opravny ? -1 : 1;
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
