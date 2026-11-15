/*
  Samozdanenie prijatej faktúry v slovenskej POHODE — tri doklady.

  Overené v POHODE SK 14404.8 (kópia PALIERA s.r.o., 15. 11. 2026). Prijatá
  faktúra v prenesení daňovej povinnosti s položkami v `priceHigh`, DPH 0
  a členením PDsluz/PDnadEU + KV B1 nefungovala: POHODA si k položke
  dopočítala 23 % DPH (na úhradu dodávateľovi 123 namiesto 100) a KV „B1“ na
  prijatej faktúre odmietla („Neznáma hodnota“). Účtovníčka PALIERY to v
  POHODE zadáva takto (prečítané z jej dát):

   1. Prijatá faktúra: sumy len v `priceNone` (bez sadzby), členenie PDsluz
      (prenesenie, tuzemské aj zo zahraničia) alebo PDnadEU (tovar z EÚ),
      KV „KN“ (nevstupuje do KV), bežná predkontácia faktúry.
   2. Interný doklad „Priznanie DPH“: DDsluz (§ 69 ods. 12), DDsl§69 (služba
      od zahraničnej osoby § 69 ods. 3), DDnadEU (tovar z EÚ); KV B1; jedna
      položka na sadzbu so základom a daňou.
   3. Interný doklad „Odpočet DPH“: to isté s PDsluz / PDnadEU (bez nároku
      PBsluz / PBnadEU), KV B1.

  Zmiešaná faktúra (časť s DPH, časť v prenesení): bežné položky ostávajú
  (PD, KV B2 dokladu), prenesené idú do `priceNone` s PDsluz a interné
  doklady len za prenesenú časť.

  Čisté funkcie — XML skladá `polozkyDokladov` (export.server.ts). Výkazy
  DPH Faktera (dph-vykazy*) z XML nečítajú a nemenia sa.
*/

import { krajinaDane } from "./vat-rates";
import { sadzbaSamozdanenia } from "./prijate-do-pohody";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** KV DPH prijatej faktúry, ktorej daň sa prizná internými dokladmi — nevstupuje do KV. */
export const KV_FAKTURY_SAMOZDANIA = "KN";
/** KV DPH interných dokladov Priznanie a Odpočet DPH. */
export const KV_INTERNYCH_SAMOZDANIA = "B1";

/** Systémové členenia DPH POHODY SK (predkontacie-systemove.ts). */
export const CLENENIA_SAMOZDANIA = {
  priznaniePrenesenie: "DDsluz",
  priznanieSluzbaZahranicie: "DDsl§69",
  priznanieNadobudnutie: "DDnadEU",
  odpocetSluzby: "PDsluz",
  odpocetSluzbyBezNaroku: "PBsluz",
  odpocetNadobudnutie: "PDnadEU",
  odpocetNadobudnutieBezNaroku: "PBnadEU",
} as const;

export type DruhSamozdania = "prenesenie" | "sluzba_zo_zahranicia" | "nadobudnutie";

/** Riadky bez dane, ktoré do priznania nepatria. */
const MIMO_SAMOZDANENIA = ["exempt", "out_of_scope"];

/**
 * Riadok rozpisu či položka, ktorej daň sa samozdaňuje: bez dane a buď
 * v prenesení (`pdp`, `reverse_charge`), alebo na celom samozdanenom doklade
 * (prenesenie, nadobudnutie z EÚ) okrem oslobodených a mimo predmetu DPH.
 */
export function jeSamozdanenyRiadok(
  r: { dph?: unknown; pdp?: unknown; vat_category?: unknown } | null | undefined,
  cele: boolean,
): boolean {
  if (!r || Math.abs(Number(r.dph ?? 0)) >= 0.005) return false;
  if (r.pdp === true || r.vat_category === "reverse_charge") return true;
  return cele && !MIMO_SAMOZDANENIA.includes(String(r.vat_category ?? ""));
}

/** Dodávateľ z inej krajiny než firma (podľa krajiny, inak predpony IČ DPH). */
export function dodavatelZoZahranicia(
  d: { supplier_country?: unknown; supplier_ic_dph?: unknown } | null | undefined,
  krajinaFirmy: string | null | undefined,
): boolean {
  const domov = krajinaDane(krajinaFirmy);
  const krajina = String(d?.supplier_country ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(krajina)) return krajina !== domov;
  const icDph = String(d?.supplier_ic_dph ?? "").replace(/\s/g, "").toUpperCase();
  if (/^[A-Z]{2}[0-9A-Z]/.test(icDph)) return icDph.slice(0, 2) !== domov;
  return false;
}

/**
 * Druh samozdanenia: nadobudnutie tovaru z EÚ (`dph_rezim = nadobudnutie`),
 * služba od zahraničnej osoby (§ 69 ods. 3 — dodávateľ mimo krajiny firmy,
 * aj mimo EÚ), inak tuzemské prenesenie (§ 69 ods. 12).
 */
export function druhSamozdania(
  d: { _rezim?: unknown; dph_rezim?: unknown; supplier_country?: unknown; supplier_ic_dph?: unknown } | null | undefined,
  krajinaFirmy: string | null | undefined,
): DruhSamozdania {
  if (String(d?._rezim ?? d?.dph_rezim ?? "").trim() === "nadobudnutie") return "nadobudnutie";
  return dodavatelZoZahranicia(d, krajinaFirmy) ? "sluzba_zo_zahranicia" : "prenesenie";
}

/**
 * Členenia DPH troch dokladov. Faktúra nesie to isté ako Odpočet DPH (PDsluz,
 * PDnadEU, bez nároku PB…). `clenenieFirmy` = nastavenie firmy pre prijaté
 * prenesenie (`pohoda_clenenie_dph_prijata_pdp`), `clenenieNadobudnutia` =
 * kód z číselníka firmy pre nadobudnutie (`clenenieRezimuPrijatej`) — majú
 * prednosť pred systémovým kódom.
 */
export function cleneniaSamozdania(
  druh: DruhSamozdania,
  o: { odpocet?: boolean | null; clenenieFirmy?: string | null; clenenieNadobudnutia?: string | null } = {},
): { faktura: string; priznanie: string; odpocet: string | null } {
  const c = CLENENIA_SAMOZDANIA;
  /*
    Bez nároku na odpočet: Odpočet DPH sa nerobí vôbec (odpocet = null) —
    daň sa len prizná. Faktúra ostáva s bežným PDsluz/PDnadEU (je bez DPH,
    nič neodpočíta); PBsluz/PBnadEU majú firmy v POHODE často vypnuté a
    POHODA ich potom zmení na PD/UN (overené naostro 15. 11. 2026).
  */
  const bezNaroku = o.odpocet === false;
  const t = (v: unknown) => String(v ?? "").trim();
  if (druh === "nadobudnutie") {
    const odp = t(o.clenenieNadobudnutia) || c.odpocetNadobudnutie;
    return { faktura: odp, priznanie: c.priznanieNadobudnutie, odpocet: bezNaroku ? null : odp };
  }
  const odp = t(o.clenenieFirmy) || c.odpocetSluzby;
  return {
    faktura: odp,
    priznanie: druh === "sluzba_zo_zahranicia" ? c.priznanieSluzbaZahranicie : c.priznaniePrenesenie,
    odpocet: bezNaroku ? null : odp,
  };
}

/** Texty interných dokladov tak, ako ich píše účtovníčka (s VS faktúry). */
export function textySamozdania(druh: DruhSamozdania, vs: string | null | undefined): { priznanie: string; odpocet: string } {
  const k = String(vs ?? "").trim() ? `, var.sym. ${String(vs).trim()}` : "";
  const coho = druh === "nadobudnutie" ? "z nadobudnutia tovaru z iného štátu EÚ" : "z nadobudnutia tovaru a služby";
  return { priznanie: `Priznanie DPH ${coho}${k}`, odpocet: `Odpočet DPH ${coho}${k}` };
}

/** Riadok interného dokladu — základ a daň v mene faktúry. */
export type RiadokSamozdania = { sadzba: number; zaklad: number; dph: number };

/**
 * Riadky interných dokladov: samozdanené riadky rozpisu po sadzbách. Riadok
 * bez sadzby dostane základnú sadzbu krajiny firmy k dňu dodania
 * (`sadzbaSamozdanenia`, aj historické 20 %), uvedená sadzba ostáva. Daň =
 * základ × sadzba, zaokrúhlená na cent (tak ju vypočíta aj POHODA).
 */
export function riadkySamozdania<
  T extends { sadzba: number; zaklad: number; dph?: number; pdp?: boolean; vat_category?: string | null },
>(rozpis: T[], o: { cele: boolean; krajina?: string | null; den?: string | null }): RiadokSamozdania[] {
  const vybrane = rozpis.filter((r) => jeSamozdanenyRiadok(r, o.cele) && Math.abs(Number(r.zaklad ?? 0)) >= 0.005);
  const so = sadzbaSamozdanenia(vybrane, { cele: true, krajina: o.krajina, den: o.den });
  const po = new Map<number, number>();
  for (const r of so) po.set(Number(r.sadzba) || 0, r2((po.get(Number(r.sadzba) || 0) ?? 0) + Number(r.zaklad)));
  return [...po.entries()]
    .filter(([, z]) => Math.abs(z) >= 0.005)
    .sort((a, b) => b[0] - a[0])
    .map(([sadzba, zaklad]) => ({ sadzba, zaklad, dph: r2((zaklad * sadzba) / 100) }));
}
