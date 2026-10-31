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
*/
import { znamienkoDokladu } from "./faktury-sumy";
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

/** DPH na výstupe po sadzbách z položiek vystavených dokladov. */
export function vystupPrehladu(
  faktury: VystavenaPrehladu[],
  polozky: PolozkaPrehladu[],
): RiadkyPrehladu {
  const b = prazdneRiadky();
  const podlaId = new Map(faktury.map((f) => [f.id, f]));
  for (const it of polozky) {
    const f = podlaId.get(it.invoice_id);
    if (!f) continue;
    const key = f.reverse_charge ? "pdp" : vatBucketKey(it.vat_rate as number | null | undefined);
    const r = riadokPre(b, key);
    const zn = znamienkoDokladu(f.type, f.total);
    r.base += zn * n(it.subtotal);
    r.vat += zn * n(it.vat_amount);
    r.docs.add(it.invoice_id);
  }
  for (const k of Object.keys(b)) b[k].count = b[k].docs.size;
  return b;
}

/**
 * DPH na vstupe z prijatých faktúr. Sadzbu nemajú uloženú — dopočíta sa z
 * pomeru dane k základu a prilepí k najbližšej platnej sadzbe.
 */
export function vstupPrehladu(prijate: PrijataPrehladu[], krajina: KrajinaDane): RiadkyPrehladu {
  const b = prazdneRiadky();
  for (const p of prijate) {
    const base = n(p.amount_without_vat);
    const vat = n(p.vat_amount);
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
