/*
  Odpočet zálohy na vyúčtovacej faktúre — jeden tvar pre všetky exporty.

  Faktúra si zálohy pamätá v `invoice_advances` (zálohová faktúra + odpočítaná
  suma s DPH). Daň zo zálohy sa priznala už dokladom k prijatej platbe, preto
  sa odpočet zapisuje ako záporný riadok v jeho sadzbách: vyúčtovanie potom
  nesie len rozdiel dane, rovnako ako výkaz k DPH.

  Zálohu bez dokladu k platbe (nezdanenú) formáty bez väzby na zálohu
  nezapíšu správne — tá ostáva na ručné zúčtovanie.
*/

export type RiadokOdpoctu = { sadzba: number; zaklad: number; dph: number };

export type OdpocetZalohy = {
  /** Číslo zálohovej faktúry. */
  zaloha: string;
  /** Číslo dokladu k prijatej platbe; bez neho je záloha nezdanená. */
  doklad: string | null;
  /** Variabilný symbol zálohy (pre ISDOC). */
  vs: string | null;
  /** Odpočítaná suma s DPH. */
  suma: number;
  /** Zdanená časť po sadzbách (kladné sumy); prázdne pri nezdanenej zálohe. */
  riadky: RiadokOdpoctu[];
};

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Riadky dokladu k platbe pomerne k odpočítanej sume — záloha sa dá odpočítať
 * aj po častiach. Halierový rozdiel dorovná posledný riadok.
 */
export function riadkyOdpoctu(
  suma: number,
  doklad: RiadokOdpoctu[],
): RiadokOdpoctu[] {
  const spolu = doklad.reduce((a, r) => a + r.zaklad + r.dph, 0);
  if (!spolu || !doklad.length) return [];
  const k = Math.min(1, Math.abs(suma) / spolu);
  if (k === 1) return doklad.map((r) => ({ ...r }));
  const ciel = r2(Math.abs(suma));
  let zostava = ciel;
  return doklad.map((r, i) => {
    if (i === doklad.length - 1) {
      const dph = r2((zostava * r.sadzba) / (100 + r.sadzba));
      return { sadzba: r.sadzba, zaklad: r2(zostava - dph), dph };
    }
    const zaklad = r2(r.zaklad * k);
    const dph = r2(r.dph * k);
    zostava = r2(zostava - zaklad - dph);
    return { sadzba: r.sadzba, zaklad, dph };
  });
}

/** Faktúra odpočítava zálohu, ktorú vie formát zapísať (všetky zdanené). */
export function odpoctyZapisatelne(odpocty: OdpocetZalohy[] | null | undefined): boolean {
  return Boolean(odpocty?.length) && odpocty!.every((o) => o.doklad && o.riadky.length);
}

/** Odpočítaný základ a daň spolu po sadzbách (kladné sumy). */
export function suhrnOdpoctov(odpocty: OdpocetZalohy[]): RiadokOdpoctu[] {
  const po = new Map<number, RiadokOdpoctu>();
  for (const o of odpocty)
    for (const r of o.riadky) {
      const x = po.get(r.sadzba) ?? { sadzba: r.sadzba, zaklad: 0, dph: 0 };
      x.zaklad = r2(x.zaklad + r.zaklad);
      x.dph = r2(x.dph + r.dph);
      po.set(r.sadzba, x);
    }
  return [...po.values()].sort((a, b) => b.sadzba - a.sadzba);
}

/** Odpočítaná suma s DPH spolu. */
export function sumaOdpoctov(odpocty: OdpocetZalohy[] | null | undefined): number {
  return r2((odpocty ?? []).reduce((a, o) => a + o.suma, 0));
}

/**
 * Text riadku odpočtu — číslo dokladu k platbe, ktorým sa daň priznala, a
 * zálohová faktúra, na ktorú sa platilo.
 */
export function textOdpoctu(o: OdpocetZalohy): string {
  return `Odpočet zálohy ${o.doklad ?? o.zaloha}${o.doklad && o.doklad !== o.zaloha ? ` (k ${o.zaloha})` : ""}`;
}

/**
 * Faktúra s odpočtom zálohy, ktorú formát nevie zapísať — vyúčtovanie so
 * starým stĺpcom bez väzby, alebo nezdanená záloha. Pre hlášku do exportu.
 */
export function prekazkaOdpoctu(
  invoice: { type?: unknown; advance_amount?: unknown; invoice_number?: unknown; _odpocty?: OdpocetZalohy[] | null },
  program: string,
): string | null {
  const typ = String(invoice.type ?? "");
  if (typ === "proforma" || typ === "advance_payment") return null;
  if (!(Number(invoice.advance_amount ?? 0) > 0) && !invoice._odpocty?.length) return null;
  if (odpoctyZapisatelne(invoice._odpocty)) return null;
  if (!invoice._odpocty?.length)
    return `${invoice.invoice_number} — odpočet zálohy bez väzby na zálohovú faktúru, treba ho v ${program} zaúčtovať ručne`;
  return `${invoice.invoice_number} — faktúra s odpočtom nezdanenej zálohy (bez dokladu k prijatej platbe), odpočet treba v ${program} zaúčtovať ručne`;
}

/**
 * Odpočet ako záporné položky faktúry (tvar `invoice_items`) — pre formáty,
 * ktoré skladajú súčty po sadzbách z položiek (Omega, Money S3, Flexi).
 */
export function polozkyOdpoctu(odpocty: OdpocetZalohy[] | null | undefined): {
  name: string;
  description: null;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  subtotal: number;
  vat_amount: number;
  total: number;
  _odpocet: true;
}[] {
  return (odpocty ?? []).flatMap((o) =>
    o.riadky.map((r) => ({
      name: textOdpoctu(o),
      description: null,
      quantity: 1,
      unit: "ks",
      unit_price: -r.zaklad,
      vat_rate: r.sadzba,
      subtotal: -r.zaklad,
      vat_amount: -r.dph,
      total: -r2(r.zaklad + r.dph),
      _odpocet: true as const,
    })),
  );
}
