/**
 * XML pre elektronické podanie Finančnej správy ČR (EPO, portál MOJE daně).
 *
 * Tvar podľa oficiálnych schém v `schemy/` — `dphdp3_epo2.xsd` (priznanie,
 * štruktúra 03.01.04) a `dphkh1_epo2.xsd` (kontrolné hlásenie, 03.01.15).
 * Testy výstup proti nim overujú; podateľňa súbor, ktorý schéme nesedí,
 * odmietne celý.
 */

import { bezZakazanychXml } from "@/lib/bezpecny-text";
import {
  datumCz,
  type SouhrnneHlaseni,
  kontrolniRadkyC,
  type KontrolniHlaseni,
  type PriznaniCz,
  type Suhrn,
} from "./cz-dph";
import type { Obdobie } from "./dph-vykazy";

export const VERZIA_DP3 = "03.01.04";
export const VERZIA_KH1 = "03.01.15";
export const VERZIA_SHV = "02.01.05";

/** Údaje firmy a podania, ktoré z dokladov nevyplývajú. */
export type HlavickaCz = {
  /** Kmeňová časť DIČ (bez CZ). */
  dic: string;
  nazov: string;
  ulica?: string | null;
  obec?: string | null;
  psc?: string | null;
  email?: string | null;
  telefon?: string | null;
  /** Kód finančného úradu (číselník „ufo“, napr. 451 = FÚ pro hl. m. Prahu). */
  cUfo: string;
  /** Kód územného pracoviska (číselník „pracufo“, 4 číslice). */
  cPracufo?: string | null;
  /** CZ-NACE prevažujúcej činnosti. */
  okec?: string | null;
  /** P = plátca, I = identifikovaná osoba. */
  typPlatce: "P" | "I";
  /** Kto podáva za právnickú osobu. */
  oprJmeno?: string | null;
  oprPrijmeni?: string | null;
  oprPostaveni?: string | null;
};

/** B řádné, O řádné-opravné, D dodatečné, E dodatečné-opravné; KH má N = následné. */
export type FormaCz = "B" | "O" | "D" | "E" | "N";

function esc(v: unknown): string {
  return bezZakazanychXml(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function atributy(o: Record<string, unknown>): string {
  return Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join("");
}

const hal = (n: number) => (Math.round((Number(n) + Number.EPSILON) * 100) / 100).toFixed(2);
const sKorun = (n: number) => String(Math.round(Number(n)));

/** „Jeremiášova 1422/7b“ → ulica, číslo popisné, číslo orientačné. */
export function rozdelUlicu(v?: string | null): {
  ulice: string;
  c_pop?: string;
  c_orient?: string;
} {
  const s = String(v ?? "").trim();
  const m = /^(.*?)[\s,]+(\d{1,6})(?:\/(\w{1,4}))?\s*$/.exec(s);
  if (!m) return { ulice: s.slice(0, 38) };
  return { ulice: m[1].slice(0, 38), c_pop: m[2], c_orient: m[3] };
}

/** `kontakt: false` — súhrnné hlásenie e-mail ani telefón v hlavičke nepozná. */
function vetaP(h: HlavickaCz, kontakt = true): string {
  const u = rozdelUlicu(h.ulica);
  return `<VetaP${atributy({
    c_ufo: h.cUfo,
    c_pracufo: h.cPracufo,
    dic: String(h.dic).replace(/\D/g, ""),
    typ_ds: "P",
    zkrobchjm: h.nazov.slice(0, 255),
    ulice: u.ulice,
    c_pop: u.c_pop,
    c_orient: u.c_orient,
    naz_obce: String(h.obec ?? "").slice(0, 48),
    psc: String(h.psc ?? "")
      .replace(/\s/g, "")
      .slice(0, 10),
    stat: "ČESKÁ REPUBLIKA",
    email: kontakt ? h.email : undefined,
    c_telef: kontakt ? String(h.telefon ?? "").slice(0, 14) : undefined,
    opr_jmeno: h.oprJmeno,
    opr_prijmeni: h.oprPrijmeni,
    opr_postaveni: h.oprPostaveni,
  })}/>`;
}

function obdobieAtr(o: Obdobie) {
  return o.stvrtrok ? { rok: o.rok, ctvrt: o.stvrtrok } : { rok: o.rok, mesic: o.mesiac ?? 1 };
}

/** Atribúty jednej vety z riadkov priznania — nuly sa vynechajú. */
function vetaZRiadkov(nazov: string, polia: string[], r: PriznaniCz): string {
  const o: Record<string, string> = {};
  for (const k of polia) if (r[k]) o[k] = sKorun(r[k]);
  return Object.keys(o).length ? `<${nazov}${atributy(o)}/>` : "";
}

const VETA1 = [
  "obrat23",
  "dan23",
  "obrat5",
  "dan5",
  "p_zb23",
  "dan_pzb23",
  "p_zb5",
  "dan_pzb5",
  "p_sl23_e",
  "dan_psl23_e",
  "p_sl5_e",
  "dan_psl5_e",
  "dov_zb23",
  "dan_dzb23",
  "dov_zb5",
  "dan_dzb5",
  "p_dop_nrg",
  "dan_pdop_nrg",
  "rez_pren23",
  "dan_rpren23",
  "rez_pren5",
  "dan_rpren5",
  "p_sl23_z",
  "dan_psl23_z",
  "p_sl5_z",
  "dan_psl5_z",
];
const VETA2 = [
  "dod_zb",
  "pln_sluzby",
  "pln_vyvoz",
  "dod_dop_nrg",
  "pln_zaslani",
  "pln_rez_pren",
  "pln_ost",
];
const VETA3 = ["tri_pozb", "tri_dozb", "dov_osv", "opr_verit", "opr_dluz"];
const VETA4 = [
  "pln23",
  "odp_tuz23_nar",
  "pln5",
  "odp_tuz5_nar",
  "dov_cu",
  "odp_cu_nar",
  "nar_zdp23",
  "od_zdp23",
  "nar_zdp5",
  "od_zdp5",
  "odp_rez_nar",
  "odp_sum_nar",
];

export function dp3NaXml(
  r: PriznaniCz,
  h: HlavickaCz,
  obdobie: Obdobie,
  forma: Exclude<FormaCz, "N"> = "B",
  dnes = new Date(),
): string {
  const dan = Number(r.dan_zocelk ?? 0);
  const odp = Number(r.odp_zocelk ?? 0);
  const veta6: Record<string, string> = {
    dan_zocelk: sKorun(dan),
    odp_zocelk: sKorun(odp),
  };
  if (forma === "D" || forma === "E") veta6.dano = sKorun(dan - odp);
  else if (dan >= odp) veta6.dano_da = sKorun(dan - odp);
  else veta6.dano_no = sKorun(odp - dan);

  const vetaD = `<VetaD${atributy({
    dokument: "DP3",
    k_uladis: "DPH",
    dapdph_forma: forma,
    typ_platce: h.typPlatce,
    ...obdobieAtr(obdobie),
    d_poddp: datumCz(dnes.toISOString()),
    c_okec: h.okec,
    trans: dan || odp ? "A" : "N",
  })}/>`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Pisemnost nazevSW="Faktero" verzeSW="1.0">`,
    `<DPHDP3 verzePis="${VERZIA_DP3}">`,
    vetaD,
    vetaP(h),
    vetaZRiadkov("Veta1", VETA1, r),
    vetaZRiadkov("Veta2", VETA2, r),
    vetaZRiadkov("Veta3", VETA3, r),
    vetaZRiadkov("Veta4", VETA4, r),
    `<Veta6${atributy(veta6)}/>`,
    `</DPHDP3>`,
    `</Pisemnost>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function sumyAtr(s: Pick<Suhrn, "zaklad1" | "dan1" | "zaklad2" | "dan2">) {
  return {
    zakl_dane1: hal(s.zaklad1),
    dan1: hal(s.dan1),
    ...(s.zaklad2 || s.dan2 ? { zakl_dane2: hal(s.zaklad2), dan2: hal(s.dan2) } : {}),
  };
}

export function kh1NaXml(
  kh: KontrolniHlaseni,
  h: HlavickaCz,
  obdobie: { rok: number; mesiac: number },
  opts: { forma?: Exclude<FormaCz, "D">; kodPredmetu: string; dnes?: Date },
): string {
  const forma = opts.forma ?? "B";
  const riadky: string[] = [];
  kh.a1.forEach((r, i) =>
    riadky.push(
      `<VetaA1${atributy({
        c_radku: i + 1,
        dic_odb: r.dic,
        c_evid_dd: r.doklad.slice(0, 60),
        duzp: datumCz(r.duzp),
        zakl_dane1: hal(r.zaklad),
        kod_pred_pl: opts.kodPredmetu,
      })}/>`,
    ),
  );
  kh.a2.forEach((r, i) =>
    riadky.push(
      `<VetaA2${atributy({
        c_radku: i + 1,
        k_stat: r.stat,
        vatid_dod: r.vatId,
        c_evid_dd: r.doklad.slice(0, 60),
        dppd: datumCz(r.dppd),
        ...sumyAtr(r),
      })}/>`,
    ),
  );
  kh.a4.forEach((r, i) =>
    riadky.push(
      `<VetaA4${atributy({
        c_radku: i + 1,
        dic_odb: r.dic,
        c_evid_dd: r.doklad.slice(0, 60),
        dppd: datumCz(r.dppd),
        ...sumyAtr(r),
        kod_rezim_pl: "0",
        zdph_44: "N",
      })}/>`,
    ),
  );
  if (kh.a5.zaklad1 || kh.a5.dan1 || kh.a5.zaklad2 || kh.a5.dan2)
    riadky.push(`<VetaA5${atributy(sumyAtr(kh.a5))}/>`);
  kh.b1.forEach((r, i) =>
    riadky.push(
      `<VetaB1${atributy({
        c_radku: i + 1,
        dic_dod: r.dic,
        c_evid_dd: r.doklad.slice(0, 60),
        duzp: datumCz(r.duzp),
        ...sumyAtr(r),
        kod_pred_pl: opts.kodPredmetu,
      })}/>`,
    ),
  );
  kh.b2.forEach((r, i) =>
    riadky.push(
      `<VetaB2${atributy({
        c_radku: i + 1,
        dic_dod: r.dic,
        c_evid_dd: r.doklad.slice(0, 60),
        dppd: datumCz(r.dppd),
        ...sumyAtr(r),
        pomer: r.pomer ? "A" : "N",
        zdph_44: "N",
      })}/>`,
    ),
  );
  if (kh.b3.zaklad1 || kh.b3.dan1 || kh.b3.zaklad2 || kh.b3.dan2)
    riadky.push(`<VetaB3${atributy(sumyAtr(kh.b3))}/>`);

  const c = kontrolniRadkyC(kh);
  const cAtr: Record<string, string> = {};
  for (const [k, v] of Object.entries(c)) if (v) cAtr[k] = hal(v);

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Pisemnost nazevSW="Faktero" verzeSW="1.0">`,
    `<DPHKH1 verzePis="${VERZIA_KH1}">`,
    `<VetaD${atributy({
      dokument: "KH1",
      k_uladis: "DPH",
      khdph_forma: forma,
      rok: obdobie.rok,
      mesic: obdobie.mesiac,
      d_poddp: datumCz((opts.dnes ?? new Date()).toISOString()),
    })}/>`,
    vetaP(h),
    ...riadky,
    Object.keys(cAtr).length ? `<VetaC${atributy(cAtr)}/>` : "",
    `</DPHKH1>`,
    `</Pisemnost>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Súhrnné hlásenie VIES (DPHSHV). Riadok má číslo najviac dvojmiestne, preto
 * sa po 99 riadkoch pokračuje na ďalšej strane (`por_c_stran`).
 */
export function shvNaXml(
  sh: SouhrnneHlaseni,
  h: HlavickaCz,
  obdobie: Obdobie,
  opts: { forma?: "R" | "N"; dnes?: Date } = {},
): string {
  const riadky = sh.riadky.map(
    (r, i) =>
      `<VetaR${atributy({
        por_c_stran: Math.floor(i / 99) + 1,
        c_rad: (i % 99) + 1,
        k_stat: r.stat,
        c_vat: r.vatId,
        k_pln_eu: r.kod,
        pln_pocet: r.pocet,
        pln_hodnota: String(Math.round(r.hodnota)),
      })}/>`,
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Pisemnost nazevSW="Faktero" verzeSW="1.0">`,
    `<DPHSHV verzePis="${VERZIA_SHV}">`,
    `<VetaD${atributy({
      dokument: "SHV",
      k_uladis: "DPH",
      shvies_forma: opts.forma ?? "R",
      ...obdobieAtr(obdobie),
      d_poddp: datumCz((opts.dnes ?? new Date()).toISOString()),
    })}/>`,
    vetaP(h, false),
    ...riadky,
    `</DPHSHV>`,
    `</Pisemnost>`,
  ].join("\n");
}
