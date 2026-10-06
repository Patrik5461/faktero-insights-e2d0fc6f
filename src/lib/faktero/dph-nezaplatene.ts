/*
  DPH pri nezaplatených faktúrach (zákon 222/2004, znenie od 1. 1. 2025).

  § 53b — odberateľ, POVINNE: z faktúry od platiteľa (§ 69 ods. 1), ktorá nie je
  zaplatená, vráti odpočítanú daň v období, v ktorom „nastal 101. deň odo dňa
  splatnosti“ — v rozsahu nezaplatenej časti. Bez dokladu. Priznanie r. 29
  (plus), kontrolný výkaz C.2 s FO „0“, záporné hodnoty a ONP = „x“. Keď
  faktúru neskôr zaplatí, odpočíta daň znova v období úhrady (r. 29 mínus,
  C.2 kladné). Neplatí pri prenesení daňovej povinnosti, § 68d ani bez odpočtu.

  § 25a — dodávateľ, MÔŽE: keď 150 dní po splatnosti nedostal zaplatené
  (do 1 000 € s DPH stačí preukázateľný úkon, napr. upomienka; nad 1 000 €
  podaná žaloba alebo exekúcia), opraví základ dane opravným dokladom s textom
  „oprava základu dane podľa § 25a“, ktorý musí do lehoty na podanie
  priznania aj odoslať. Priznanie r. 26 a r. 27 (mínus), KV C.1 s ONP = „x“.
  Do 3 rokov od lehoty na podanie priznania za obdobie dodania. Keď odberateľ
  neskôr zaplatí, oprava sa vráti dokladom podľa § 25a ods. 10 (plus).
*/

import type { SadzbovyRiadok } from "./dph-vykazy";

export const VETA_25A = "oprava základu dane podľa § 25a";

/** Deň „D + n“ ako YYYY-MM-DD. */
export function pridajDni(den: string, n: number): string {
  const d = new Date(`${String(den).slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 101. deň odo dňa splatnosti (§ 53b ods. 1 písm. a). */
export function den53b(splatnost: string): string {
  return pridajDni(splatnost, 101);
}

const centy = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Riadky zmenšené na nezaplatenú časť (pomer k celkovej sume s DPH). */
export function cast(riadky: SadzbovyRiadok[], podiel: number): SadzbovyRiadok[] {
  const k = Math.min(Math.max(podiel, 0), 1);
  return riadky
    .map((r) => ({ sadzba: r.sadzba, zaklad: centy(r.zaklad * k), dan: centy(r.dan * k) }))
    .filter((r) => r.zaklad !== 0 || r.dan !== 0);
}

const otoc = (riadky: SadzbovyRiadok[]) =>
  riadky.map((r) => ({ sadzba: r.sadzba, zaklad: -r.zaklad, dan: -r.dan }));

export type PrijataNaKontrolu = {
  cislo: string;
  dodavatelIcDph?: string | null;
  rezim: "tuzemsko" | "samozdanenie" | "nadobudnutie" | "dovoz" | "bez_dane";
  odpocet: boolean;
  /** Dobropis a zálohová faktúra sa § 53b netýkajú. */
  dobropis: boolean;
  splatnost: string | null;
  /** Dátum úhrady; `null` + `zaplatena` = zaplatená bez dátumu (berie sa ako načas). */
  zaplatenaDna: string | null;
  zaplatena: boolean;
  riadky: SadzbovyRiadok[];
};

export type Oprava53b = {
  cislo: string;
  dodavatelIcDph?: string | null;
  druh: "vratenie" | "opatovny_odpocet";
  den: string;
  /** Znamienko podľa výkazu: vrátenie záporné, opätovný odpočet kladné. */
  riadky: SadzbovyRiadok[];
};

/**
 * Opravy odpočtu podľa § 53b, ktoré patria do obdobia `od`–`do`.
 * Faktúry nesledujú čiastočné úhrady — nezaplatená je celá, kým nie je
 * zaplatená.
 */
export function opravy53b(
  faktury: PrijataNaKontrolu[],
  od: string,
  doDna: string,
  dph68d = false,
): Oprava53b[] {
  if (dph68d) return [];
  const von: Oprava53b[] = [];
  for (const f of faktury) {
    if (f.rezim !== "tuzemsko" || !f.odpocet || f.dobropis || !f.splatnost) continue;
    const t = den53b(f.splatnost);
    const zaplatenaNacas = f.zaplatena && (!f.zaplatenaDna || f.zaplatenaDna < t);
    if (zaplatenaNacas) continue;
    if (t >= od && t <= doDna) {
      von.push({
        cislo: f.cislo,
        dodavatelIcDph: f.dodavatelIcDph,
        druh: "vratenie",
        den: t,
        riadky: otoc(f.riadky.filter((r) => r.dan !== 0)),
      });
    }
    // Zaplatená po 101. dni → v období úhrady sa odpočíta znova.
    if (f.zaplatena && f.zaplatenaDna && f.zaplatenaDna >= t && f.zaplatenaDna >= od && f.zaplatenaDna <= doDna) {
      von.push({
        cislo: f.cislo,
        dodavatelIcDph: f.dodavatelIcDph,
        druh: "opatovny_odpocet",
        den: f.zaplatenaDna,
        riadky: f.riadky.filter((r) => r.dan !== 0).map((r) => ({ ...r })),
      });
    }
  }
  return von;
}

// ── § 25a ──────────────────────────────────────────────────────────────────

export type VystavenaNaKontrolu = {
  typ: string;
  stav: string;
  splatnost: string | null;
  datumDodania: string;
  spoluSDph: number;
  zaplatene: number;
  prenosDane: boolean;
  oss: boolean;
  dph: number;
  /** Už existuje oprava podľa § 25a (zníženie) k tejto faktúre. */
  uzOpravena: boolean;
  /** Počet odoslaných upomienok — preukázateľný úkon do 1 000 €. */
  upomienok: number;
};

export type Narok25a =
  | {
      narok: true;
      /** Nad 1 000 € treba potvrdiť podanú žalobu alebo exekúciu. */
      trebaPotvrditZalobu: boolean;
      nezaplatene: number;
      podiel: number;
      od: string;
      lehotaDo: string;
    }
  | { narok: false; dovod: string; od?: string };

/** Lehota na podanie priznania za mesiac dodania (25. deň nasledujúceho mesiaca). */
function lehotaPriznania(den: string): string {
  const d = new Date(`${den.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return `${d.toISOString().slice(0, 7)}-25`;
}

export function narok25a(
  f: VystavenaNaKontrolu,
  dnes: string,
  firma: { platitel: boolean; dph68d: boolean },
): Narok25a {
  if (!firma.platitel) return { narok: false, dovod: "Firma nie je platiteľ DPH." };
  if (firma.dph68d) {
    return { narok: false, dovod: "Pri uplatňovaní dane na základe prijatia platby (§ 68d) daň z nezaplatenej faktúry ešte nevznikla." };
  }
  if (f.typ !== "regular") return { narok: false, dovod: "Opravuje sa len riadna faktúra." };
  if (f.stav === "draft" || f.stav === "cancelled") return { narok: false, dovod: "Faktúra nie je vystavená." };
  if (f.prenosDane || f.oss) return { narok: false, dovod: "Pri prenesení daňovej povinnosti a OSS sa § 25a neuplatní." };
  if (f.dph <= 0) return { narok: false, dovod: "Na faktúre nie je daň." };
  if (f.uzOpravena) return { narok: false, dovod: "Základ dane už bol opravený podľa § 25a." };
  if (!f.splatnost) return { narok: false, dovod: "Faktúra nemá splatnosť." };
  const nezaplatene = centy(f.spoluSDph - f.zaplatene);
  if (nezaplatene <= 0.009) return { narok: false, dovod: "Faktúra je zaplatená." };
  const od = pridajDni(f.splatnost, 151);
  if (dnes < od) return { narok: false, dovod: `Nárok vznikne ${od} (150 dní po splatnosti).`, od };
  const lehotaDo = pridajDni(lehotaPriznania(f.datumDodania), 365 * 3);
  if (dnes > lehotaDo) return { narok: false, dovod: "Uplynula 3-ročná lehota na opravu." };
  const nadTisic = f.spoluSDph > 1000;
  if (!nadTisic && f.upomienok < 1) {
    return {
      narok: false,
      dovod: "Do 1 000 € treba preukázať aspoň jeden úkon na vymoženie — pošlite odberateľovi upomienku.",
      od,
    };
  }
  return {
    narok: true,
    trebaPotvrditZalobu: nadTisic,
    nezaplatene,
    podiel: f.spoluSDph > 0 ? nezaplatene / f.spoluSDph : 0,
    od,
    lehotaDo,
  };
}
