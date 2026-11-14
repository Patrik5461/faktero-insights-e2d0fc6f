import { zoradPodlaSadzby } from "./vat-rates";
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
  /** Id zálohovej faktúry (konektor podľa neho hľadá jej číslo v Pohode). */
  zalohaId?: string | null;
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
  return zoradPodlaSadzby([...po.values()], "sadzba");
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
export function polozkyOdpoctu(
  odpocty: OdpocetZalohy[] | null | undefined,
  /** Názov položky (nastavenie firmy) — bez neho „Odpočet zálohy <doklad>". */
  nazov?: (text: string, sadzba: number) => string,
): {
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
      name: nazov ? nazov(textOdpoctu(o), r.sadzba) : textOdpoctu(o),
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

/** Jedna položka `invoiceAdvancePaymentItem` — jedna sadzba, odkaz na zálohovú faktúru. */
export type PolozkaOdpoctuPohody = { cislo: string | null; zaklad: number; dph: number; sadzba: number };

/**
 * Odpočet zálohy pre Pohodu — položky `invoiceAdvancePaymentItem`, každá
 * s jednou sadzbou a odkazom na svoju zálohovú faktúru (`sourceDocument`,
 * číslo zálohovej faktúry, ktoré Pohoda pri importe zálohovej dostala ako
 * `numberRequested`). Jediný výpočet pre ručný súbor, balík aj konektor.
 *
 *  - Zdanená záloha (s dokladom k prijatej platbe): po jednej položke na
 *    sadzbu dokladu k platbe (pomerne k odpočítanej sume, `riadkyOdpoctu`) —
 *    rovnako ako Pohoda sama rozpíše odpočet zálohy vo viacerých sadzbách.
 *  - Nezdanená záloha (bez dokladu k platbe): celá odpočítaná suma bez DPH
 *    (`rateVAT none`) — daň z vyúčtovania ostáva celá, len sa zníži suma
 *    na úhradu a Pohoda zálohu spáruje.
 *
 * `null`, keď sa odpočet zapísať nedá (zdanená záloha bez riadkov dokladu
 * k platbe, nulová suma) — export ho musí zastaviť, nie ticho vynechať
 * (`prekazkaOdpoctuPohody`).
 *
 * `cisloVPohode` — číslo zálohovej faktúry, ktoré jej pridelila Pohoda
 * (konektor ho pozná zo spätnej väzby), inak naše číslo.
 */
export function zalohyPrePohodu(
  odpocty: OdpocetZalohy[] | null | undefined,
  cisloVPohode?: (o: OdpocetZalohy) => string | null | undefined,
): PolozkaOdpoctuPohody[] | null {
  if (!odpocty?.length) return null;
  const out: PolozkaOdpoctuPohody[] = [];
  for (const o of odpocty) {
    const cislo = (cisloVPohode?.(o) || o.zaloha || "").trim() || null;
    if (!(Number(o.suma) > 0)) return null;
    if (o.doklad) {
      const riadky = o.riadky.filter((r) => r.zaklad || r.dph);
      if (!riadky.length) return null;
      for (const r of riadky) out.push({ cislo, sadzba: r.sadzba, zaklad: r2(r.zaklad), dph: r2(r.dph) });
    } else {
      out.push({ cislo, sadzba: 0, zaklad: r2(o.suma), dph: 0 });
    }
  }
  return out;
}

/**
 * Faktúra s odpočtom zálohy, ktorý sa do Pohody zapísať nedá — závažná chyba
 * pred exportom (ručný súbor ju ukáže s potvrdením, balík a konektor faktúru
 * vynechajú). Predtým faktúra odišla bez odpočtu bez jedinej hlášky
 * (PALIERA FA20260006, audit 14. 11. 2026, nález K2).
 *
 * Kontroluje sa len vtedy, keď volajúci odpočty načítal (`_odpocty` je na
 * faktúre, aj keď `null`) — inak sa o odpočte nedá nič povedať.
 */
export function prekazkaOdpoctuPohody(invoice: {
  type?: unknown;
  advance_amount?: unknown;
  invoice_number?: unknown;
  _odpocty?: OdpocetZalohy[] | null;
}): string | null {
  if (!invoice || !("_odpocty" in invoice)) return null;
  const typ = String(invoice.type ?? "");
  // Zálohová faktúra a doklad k platbe nesú v `advance_amount` vlastnú sumu.
  if (typ === "proforma" || typ === "advance_payment") return null;
  const cislo = String(invoice.invoice_number ?? "?");
  if (!invoice._odpocty?.length)
    return Number(invoice.advance_amount ?? 0) > 0
      ? `${cislo} — odpočet zálohy ${Number(invoice.advance_amount).toFixed(2)} bez väzby na zálohovú faktúru — do Pohody by išla bez odpočtu; pripojte zálohovú faktúru alebo odpočet zaúčtujte v Pohode ručne`
      : null;
  if (zalohyPrePohodu(invoice._odpocty)) return null;
  return `${cislo} — odpočet zálohy sa nedá zapísať do Pohody (doklad k prijatej platbe bez súm) — do Pohody by išla bez odpočtu; skontrolujte doklad k platbe alebo odpočet zaúčtujte v Pohode ručne`;
}
