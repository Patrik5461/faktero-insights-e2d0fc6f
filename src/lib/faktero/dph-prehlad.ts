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

  Obdobie (rozhodnutie 1. 11. 2026): doklad patrí do mesiaca podľa toho
  istého dňa ako vo výkazoch — `denDaneVystavenej` / `denOdpoctuPrijatej`
  používa aj `dph-vykazy.server.ts`, aby prehľad a priznanie za rovnaký
  mesiac dali rovnaké sumy. Dovtedy prehľad bral dátum vystavenia.
*/
import { denOdpoctu, type PrijatyNaOdpocet } from "./datum-prijatia";
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
  /** Rozpis DPH po sadzbách z dokladu (`[{sadzba, zaklad, dph}]`), od 5. 11. 2026. */
  vat_breakdown?: unknown;
};

/**
 * Deň, ktorým vystavený doklad vstupuje do obdobia DPH: dátum dodania, bez
 * neho vystavenia. Opravná faktúra (dobropis, ťarchopis, oprava) patrí do
 * obdobia, v ktorom bola vyhotovená (§ 25 ods. 1) — dátum dodania nesie
 * pôvodné plnenie z už podaného obdobia.
 */
export function denDaneVystavenej(f: {
  type?: string | null;
  issue_date?: string | null;
  delivery_date?: string | null;
  opravuje_fakturu_id?: string | null;
}): string | null {
  const opravna =
    f.type === "credit_note" || f.type === "debit_note" || Boolean(f.opravuje_fakturu_id);
  return (opravna ? f.issue_date || f.delivery_date : f.delivery_date || f.issue_date) || null;
}

/**
 * Deň, ktorým prijatá faktúra vstupuje do odpočtu: neskorší z dátumu dodania
 * (bez neho vystavenia) a dátumu prijatia — odpočet sa uplatní najskôr
 * v období, keď firma faktúru má (§ 51 ods. 1). Samozdanenie ostáva na dni
 * dodania, prijatý dobropis opraví odpočet v období prijatia (§ 53 ods. 2).
 * Pravidlo je v `datum-prijatia.ts`.
 */
export function denOdpoctuPrijatej(p: PrijatyNaOdpocet): string | null {
  return denOdpoctu(p);
}

/** Je deň v období `od`–`do` (ISO dátumy, vrátane hraníc)? */
export function vObdobi(den: string | null | undefined, od: string, doDna: string): boolean {
  const s = String(den ?? "").slice(0, 10);
  return s !== "" && s >= od && s <= doDna;
}

/**
 * Filter PostgREST (`.or(...)`) na doklady, ktorých niektorý z dátumov padne
 * do obdobia — presné zaradenie potom urobí `denDaneVystavenej` /
 * `denOdpoctuPrijatej`. Len podľa `issue_date` by vypadol doklad dodaný v
 * období, ale vystavený o mesiac neskôr.
 */
export function filterDatumovObdobia(stlpce: string[], od: string, doDna: string): string {
  return stlpce.map((c) => `and(${c}.gte.${od},${c}.lte.${doDna})`).join(",");
}

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

/** Riadky `vat_breakdown` prijatej faktúry, keď je v domácej mene a sedí so sumami. */
function rozpisPrijatejPrehladu(
  p: PrijataPrehladu,
  krajina: KrajinaDane,
  base: number,
  vat: number,
): { sadzba: number; zaklad: number; dph: number; vat_category: string | null }[] | null {
  if (jeCudzia(p.currency, krajina) || !Array.isArray(p.vat_breakdown)) return null;
  const riadky = (p.vat_breakdown as Record<string, unknown>[])
    .map((x) => ({
      sadzba: n(x?.sadzba),
      zaklad: n(x?.zaklad),
      dph: n(x?.dph),
      vat_category: typeof x?.vat_category === "string" ? x.vat_category : null,
    }))
    .filter((x) => x.zaklad || x.dph);
  if (!riadky.length) return null;
  const sz = riadky.reduce((a, x) => a + x.zaklad, 0);
  const sd = riadky.reduce((a, x) => a + x.dph, 0);
  if (Math.abs(sz - base) > 0.02 + 1e-9 || Math.abs(sd - vat) > 0.02 + 1e-9) return null;
  return riadky;
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
    // Uložený rozpis po sadzbách (domáca mena, sedí so sumami) — inak by viac
    // sadzieb splynulo do jednej „priemernej“ (0 % + 23 % → 19 %).
    const rozpis = rozpisPrijatejPrehladu(p, krajina, base, vat);
    if (rozpis) {
      for (const x of rozpis) {
        // „Nie je predmetom DPH“ do prehľadu DPH nepatrí vôbec.
        if (x.vat_category === "out_of_scope") continue;
        const r = riadokPre(b, x.dph === 0 ? "0" : vatBucketKey(x.sadzba));
        r.base += x.zaklad;
        r.vat += x.dph;
        r.docs.add(p.id);
      }
      continue;
    }
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
