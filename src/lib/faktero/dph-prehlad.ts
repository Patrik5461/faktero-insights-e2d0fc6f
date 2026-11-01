/*
  Výpočet informatívneho DPH prehľadu (`/uctovnictvo/dph`) — DPH na výstupe
  z vystavených dokladov a na vstupe z prijatých faktúr, po sadzbách.

  Dobropis je v databáze záporný (formulár), starší import ho mohol uložiť
  kladne. Do prehľadu ide **vždy záporne** — v súčtoch aj v zozname dokladov,
  rovnako ako v exportoch a vo výkazoch. Znamienko rieši len
  `znamienkoDokladu(typ, total)`; bez `total` by otočilo aj záporne uložený
  dobropis (tak vznikol rozpor: súčty sedeli, riadok dobropisu svietil kladne).

  Prijatý dobropis (záporné sumy) sa zaradí podľa sadzby z pomeru dane k
  základu v absolútnej hodnote — inak by spadol medzi oslobodené plnenia.

  Meny (rozhodnutie 1. 11. 2026): prehľad sčíta v domácej mene firmy rovnako
  ako výkazy (`dph-vykazy.server.ts`) — položky vystavenej faktúry v cudzej
  mene sa násobia kurzom dokladu (`domacejZaJednotku`, SK/DE ECB, CZ ČNB),
  prijaté berú uložené `*_eur` (nesú domácu menu aj pri CZ). Doklad v cudzej
  mene bez kurzu sa do súčtov nepridá (kurz 1 sa nehádá) — vráti ho
  `dokladyBezPrepoctu` a stránka ho vypíše ako „bez prepočtu“.
*/
import { znamienkoDokladu } from "./faktury-sumy";
import { domacaMena, domacejZaJednotku } from "./kurzy";
import { najblizsiaSadzba, vatBucketKey, type KrajinaDane } from "./vat-rates";

export type RiadokPrehladu = { base: number; vat: number; count: number; docs: Set<string> };
export type RiadkyPrehladu = Record<string, RiadokPrehladu>;

export type VystavenaPrehladu = {
  id: string;
  type?: string | null;
  total?: number | string | null;
  subtotal?: number | string | null;
  vat_total?: number | string | null;
  reverse_charge?: boolean | null;
  currency?: string | null;
  exchange_rate?: number | string | null;
};
export type PolozkaPrehladu = {
  invoice_id: string;
  subtotal?: number | string | null;
  vat_amount?: number | string | null;
  vat_rate?: number | string | null;
};
export type PrijataPrehladu = {
  id: string;
  amount_without_vat?: number | string | null;
  vat_amount?: number | string | null;
  currency?: string | null;
  amount_without_vat_eur?: number | string | null;
  vat_amount_eur?: number | string | null;
};

const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/** Prázdne riadky — oslobodené a prenesenie sú v prehľade vždy. */
export function prazdneRiadky(): RiadkyPrehladu {
  const b: RiadkyPrehladu = {};
  for (const r of ["exempt", "pdp"]) b[r] = { base: 0, vat: 0, count: 0, docs: new Set() };
  return b;
}

function riadokPre(b: RiadkyPrehladu, key: string): RiadokPrehladu {
  b[key] ??= { base: 0, vat: 0, count: 0, docs: new Set() };
  return b[key];
}

/** Sumy vystaveného dokladu so znamienkom, s akým vstupuje do DPH (dobropis záporne). */
export function sumyVystavenej(f: VystavenaPrehladu): {
  zaklad: number;
  dph: number;
  spolu: number;
} {
  const zn = znamienkoDokladu(f.type, f.total);
  return {
    zaklad: zn * n(f.subtotal) || 0,
    dph: zn * n(f.vat_total) || 0,
    spolu: zn * n(f.total) || 0,
  };
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Je doklad v cudzej mene? Prázdna mena = domáca. */
function jeCudzia(mena: string | null | undefined, country: string | null | undefined): boolean {
  const m = String(mena ?? "")
    .trim()
    .toUpperCase();
  return m !== "" && m !== domacaMena(country);
}

/**
 * Koľko domácej meny za 1 jednotku meny vystavenej faktúry: 1 pre domácu,
 * 0 pre cudziu bez kurzu (taká sa do súčtov nepridá).
 */
export function kurzVystavenej(f: VystavenaPrehladu, country?: string | null): number {
  if (!jeCudzia(f.currency, country)) return 1;
  return domacejZaJednotku(f.exchange_rate, country);
}

/** Základ a daň prijatej faktúry v domácej mene; `null` = cudzia mena bez prepočtu. */
export function sumyPrijatejDomace(
  p: PrijataPrehladu,
  country?: string | null,
): { base: number; vat: number } | null {
  if (!jeCudzia(p.currency, country))
    return { base: n(p.amount_without_vat), vat: n(p.vat_amount) };
  // Rovnaké pravidlo ako výkaz: stačí jeden z prepočítaných stĺpcov.
  if (p.amount_without_vat_eur == null && p.vat_amount_eur == null) return null;
  return { base: n(p.amount_without_vat_eur), vat: n(p.vat_amount_eur) };
}

export type DokladBezPrepoctu = { id: string; druh: "vystavena" | "prijata"; mena: string };

/** Doklady v cudzej mene bez kurzu — v súčtoch prehľadu nie sú. */
export function dokladyBezPrepoctu(
  faktury: VystavenaPrehladu[],
  prijate: PrijataPrehladu[],
  country?: string | null,
): DokladBezPrepoctu[] {
  const von: DokladBezPrepoctu[] = [];
  for (const f of faktury)
    if (!(kurzVystavenej(f, country) > 0))
      von.push({ id: f.id, druh: "vystavena", mena: String(f.currency).toUpperCase() });
  for (const p of prijate)
    if (!sumyPrijatejDomace(p, country))
      von.push({ id: p.id, druh: "prijata", mena: String(p.currency).toUpperCase() });
  return von;
}

/**
 * DPH na výstupe po sadzbách z položiek vystavených dokladov, v domácej mene
 * firmy (`country`; bez nej SK — EUR a kurz ECB).
 */
export function vystupPrehladu(
  faktury: VystavenaPrehladu[],
  polozky: PolozkaPrehladu[],
  country?: string | null,
): RiadkyPrehladu {
  const b = prazdneRiadky();
  const podlaId = new Map(faktury.map((f) => [f.id, f]));
  for (const it of polozky) {
    const f = podlaId.get(it.invoice_id);
    if (!f) continue;
    const kurz = kurzVystavenej(f, country);
    if (!(kurz > 0)) continue;
    const key = f.reverse_charge ? "pdp" : vatBucketKey(it.vat_rate as number | null | undefined);
    const r = riadokPre(b, key);
    const zn = znamienkoDokladu(f.type, f.total);
    // Po položkách a zaokrúhlené na centy — rovnako ako riadky výkazu.
    r.base += kurz === 1 ? zn * n(it.subtotal) : r2(zn * n(it.subtotal) * kurz);
    r.vat += kurz === 1 ? zn * n(it.vat_amount) : r2(zn * n(it.vat_amount) * kurz);
    r.docs.add(it.invoice_id);
  }
  for (const k of Object.keys(b)) b[k].count = b[k].docs.size;
  return b;
}

/**
 * DPH na vstupe z prijatých faktúr. Sadzbu nemajú uloženú — dopočíta sa z
 * pomeru dane k základu a prilepí k najbližšej platnej sadzbe. Sumy v domácej
 * mene firmy (`krajina` je zároveň krajina kurzu: CZ → CZK, inak EUR).
 */
export function vstupPrehladu(prijate: PrijataPrehladu[], krajina: KrajinaDane): RiadkyPrehladu {
  const b = prazdneRiadky();
  for (const p of prijate) {
    const domace = sumyPrijatejDomace(p, krajina);
    if (!domace) continue;
    const { base, vat } = domace;
    const ab = Math.abs(base);
    const av = Math.abs(vat);
    let key = "exempt";
    // Dobropis má základ aj daň záporné — pomer je ten istý ako pri faktúre.
    if (ab > 0 && av > 0 && Math.sign(base) === Math.sign(vat)) {
      key = vatBucketKey(najblizsiaSadzba((av / ab) * 100, krajina));
    } else if (vat === 0 && ab > 0) {
      key = "0";
    }
    const r = riadokPre(b, key);
    r.base += base;
    r.vat += vat;
    r.docs.add(p.id);
  }
  for (const k of Object.keys(b)) b[k].count = b[k].docs.size;
  return b;
}
