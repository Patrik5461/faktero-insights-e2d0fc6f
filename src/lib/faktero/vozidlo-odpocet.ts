/*
  Odpočet DPH podľa vozidla na doklade — kódy pre neodpočítateľnú časť.

  Osobné auto (M1, L1e, L3e) používané aj súkromne: od 1. 1. 2026 do
  30. 6. 2028 sa DPH z obstarania, nájmu aj prevádzky (PHM, servis, diely,
  pneumatiky…) odpočíta paušálne 50 % — § 85n zákona č. 222/2004 Z. z.
  Neodpočítaná polovica DPH je nedaňový výdavok (zákon o dani z príjmov).

  Kódy pre neodpočítateľnú časť sa berú z predkontácie firmy s pomerom
  „DPH 50/50“ (Predkontácie a členenie DPH). Kto ju nemá, dostane
  predkontáciu dokladu a členenie „bez nároku na odpočet“ z číselníka firmy
  (bez číselníka PN) — a upozornenie.
*/

import { kodClenenia, type KodCiselnika } from "./auto-uctovanie";
import { nacitajPomer, podielOdpoctuVozidla, type OdpocetVozidla } from "./rozuctovanie";

export type KodyBezOdpoctu = {
  predkontacia: string | null;
  clenenie: string | null;
  /** Kódy prišli z nastavenej predkontácie s pomerom DPH 50/50 (inak predvolené). */
  zNastavenia: boolean;
};

/** Kódy pre neodpočítateľnú časť DPH podľa nastavení firmy. */
export function kodyBezOdpoctu(
  pomery: Record<string, unknown> | null | undefined,
  ciselnik: KodCiselnika[] = [],
): KodyBezOdpoctu {
  for (const v of Object.values(pomery ?? {})) {
    const p = nacitajPomer(v);
    if (p?.typ !== "dph5050") continue;
    const pk = String(p.lenZaklad ?? "").trim() || null;
    // `lenZaklad` bez vlastného kódu je rovnaký ako zdaniteľná časť — nič nové nehovorí.
    const vlastna = pk && pk !== String(p.zdanitelna ?? "").trim() ? pk : null;
    const cl = String(p.clenenieBezOdpoctu ?? "").trim() || null;
    if (!vlastna && !cl) continue;
    return {
      predkontacia: vlastna,
      clenenie: cl ?? kodClenenia("tuzemsko_bez_odpoctu", "prijate", ciselnik),
      zNastavenia: true,
    };
  }
  return {
    predkontacia: null,
    clenenie: kodClenenia("tuzemsko_bez_odpoctu", "prijate", ciselnik),
    zNastavenia: false,
  };
}

export type VozidloNaOdpocet = {
  id: string;
  name?: string | null;
  license_plate?: string | null;
  odpocet_dph?: string | null;
};

/** Mapa vozidlo → krátený odpočet; vozidlá so 100 % (alebo bez nastavenia) v nej nie sú. */
export function odpocetVozidiel(
  vozidla: VozidloNaOdpocet[],
  kody: KodyBezOdpoctu,
): Record<string, OdpocetVozidla> {
  const out: Record<string, OdpocetVozidla> = {};
  for (const v of vozidla) {
    const podiel = podielOdpoctuVozidla(v.odpocet_dph);
    if (podiel === null) continue;
    out[String(v.id)] = {
      podiel,
      nazov:
        [v.name, v.license_plate ? `(${v.license_plate})` : ""].filter(Boolean).join(" ") || null,
      predkontaciaBezOdpoctu: kody.predkontacia,
      clenenieBezOdpoctu: kody.clenenie,
    };
  }
  return out;
}

/** Krátený odpočet vozidla na doklade, alebo `null`. */
export function odpocetDokladu(
  doklad: { vehicle_id?: unknown } | null | undefined,
  mapa: Record<string, OdpocetVozidla> | null | undefined,
): OdpocetVozidla | null {
  const id = String(doklad?.vehicle_id ?? "").trim();
  return (id && mapa?.[id]) || null;
}
