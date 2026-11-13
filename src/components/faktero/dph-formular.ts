/*
  Pravidlá zadávania DPH vo formulároch prijatých dokladov (Patrik 13. 11.):
  „nedovoľ prepisovať zákonné sadzby DPH“.

  - sadzba je výber len zo zákonných sadzieb krajiny firmy v deň dodania,
  - DPH riadku sa počíta zo základu; človek ju smie doladiť len o zaokrúhlenie
    (±0,02 v mene dokladu), väčšiu zmenu formulár nepustí,
  - hlavička (bez DPH, DPH) je súčet rozpisu.

  Uloženie rozhoduje spoločné pravidlo `skontrolujDph` z `@/lib/faktero/dph-pravidlo`
  (to isté stráži spúšťač v databáze) + súlad so sumou vytlačenou na doklade.
*/
import { krajinaDane } from "@/lib/faktero/vat-rates";
import {
  dphZoZakladu as dphPravidla,
  jePovoleneZaokruhlenie,
  krajinaDodavatelaDph,
  maxZaokruhlenie,
  skontrolujDph,
  zaokruhlenieDokladu,
  zakonneSadzby,
  type ChybaDph,
} from "@/lib/faktero/dph-pravidlo";
import { sadzbyStatuSHistoriou, statEu } from "@/lib/faktero/sadzby-eu";
import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
import {
  kategoriaRiadku,
  sNesuladomDokladu,
  type VysledokKontroly,
} from "@/lib/faktero/rozpis-dph-kontrola";

/** Riadok rozpisu DPH tak, ako ho drží formulár a ako sa ukladá do `vat_breakdown`. */
export type RiadokRozpisu = {
  sadzba: number;
  zaklad: number;
  dph: number;
  vat_category?: string | null;
  pdp?: boolean;
};

/** O koľko smie človek DPH riadku posunúť voči základ × sadzba (zaokrúhlenie). */
export const DOLADENIE_DPH = 0.02;

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Zákonné sadzby krajiny firmy v deň dodania (bez dňa dnešné). Zahraničný
 * dodávateľ z EÚ (hotel v Rakúsku) smie mať aj sadzby svojho štátu — ako
 * v pravidle `skontrolujDph`.
 */
export function sadzbyNaVyber(
  krajina: string | null | undefined,
  den?: string | null,
  krajinaDodavatela?: string | null,
): number[] {
  const k = krajinaDane(krajina ?? "SK");
  const d = den ? String(den).slice(0, 10) : "";
  const s = zakonneSadzby(k, /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : dnesBratislava());
  const dod = String(krajinaDodavatela ?? "").trim().toUpperCase();
  if (dod && dod !== k) {
    // Štát EÚ: súčasné aj historické (2023–2026) sadzby — ako pravidlo `skontrolujDph`.
    const cudzie =
      dod === "SK" || dod === "CZ" || dod === "DE"
        ? zakonneSadzby(dod, /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null)
        : statEu(dod)
          ? sadzbyStatuSHistoriou(dod)
          : [];
    return [...new Set([...s, ...cudzie])].sort((a, b) => b - a);
  }
  return [...s].sort((a, b) => b - a);
}

/** Zdaniteľný riadok (nesie DPH)? Prenesenie, oslobodené a „nie je predmetom“ majú DPH 0. */
export function nesieDph(r: Pick<RiadokRozpisu, "sadzba" | "vat_category" | "pdp">): boolean {
  if (r.pdp) return false;
  const k = kategoriaRiadku({ rate: r.sadzba, vat_category: r.vat_category });
  return k === "standard" || k === "needs_review";
}

/** DPH riadku zo základu a sadzby, zaokrúhlená na centy (pravidlo `dph-pravidlo`). */
export function dphZoZakladu(zaklad: number, sadzba: number): number {
  const v = dphPravidla(zaklad, sadzba);
  return Object.is(v, -0) ? 0 : v;
}

/** DPH, ktorú riadok musí mať (pri nezdaniteľnom 0). */
export function vypocitanaDph(r: RiadokRozpisu): number {
  return nesieDph(r) ? dphZoZakladu(r.zaklad, r.sadzba) : 0;
}

/**
 * DPH, ktorú zadal človek: v rozsahu zaokrúhlenia ostane, inak sa vráti
 * vypočítaná a `odmietnuta: true` (formulár to povie).
 */
export function dphZoVstupu(r: RiadokRozpisu, zadana: number): { dph: number; odmietnuta: boolean } {
  const vyp = vypocitanaDph(r);
  if (!nesieDph(r)) return { dph: 0, odmietnuta: Math.abs(zadana) > 0.004 };
  if (Math.abs(r2(zadana) - vyp) <= DOLADENIE_DPH + 1e-9) return { dph: r2(zadana), odmietnuta: false };
  return { dph: vyp, odmietnuta: true };
}

/** Zmena základu prepočíta DPH riadku. */
export function zmenaZakladu(r: RiadokRozpisu, zaklad: number): RiadokRozpisu {
  const n = { ...r, zaklad: r2(zaklad) };
  return { ...n, dph: vypocitanaDph(n) };
}

/** Súčty rozpisu — hlavička dokladu. */
export function suctyRozpisu(riadky: readonly RiadokRozpisu[]): { zaklad: number; dph: number; spolu: number } {
  const zaklad = r2(riadky.reduce((a, r) => a + (Number(r.zaklad) || 0), 0));
  const dph = r2(riadky.reduce((a, r) => a + (Number(r.dph) || 0), 0));
  return { zaklad, dph, spolu: r2(zaklad + dph) };
}

/** Sadzba do starého poľa `vat_rate` (bloček): pri jednej sadzbe tá, inak najvyššia zdaniteľná. */
export function hlavnaSadzba(riadky: readonly RiadokRozpisu[]): number | null {
  if (!riadky.length) return null;
  if (riadky.length === 1) return Number(riadky[0]!.sadzba) || 0;
  const zd = riadky.filter(nesieDph).map((r) => Number(r.sadzba) || 0);
  return zd.length ? Math.max(...zd) : 0;
}

/**
 * Rozpis z uloženého dokladu: `vat_breakdown` ({sadzba,zaklad,dph} aj
 * {rate,base,vat}), inak jeden riadok z hlavičky. Znamienko ostáva
 * (dobropis je v databáze záporný).
 */
export function rozpisZDokladu(d: {
  vat_breakdown?: unknown;
  vat_rate?: unknown;
  zaklad?: unknown;
  dph?: unknown;
}): RiadokRozpisu[] {
  const c = (v: unknown) => {
    const n = Number(typeof v === "string" ? v.replace(",", ".") : v);
    return Number.isFinite(n) ? n : 0;
  };
  const pole = Array.isArray(d.vat_breakdown) ? (d.vat_breakdown as any[]) : [];
  if (pole.length)
    return pole.map((r) => ({
      sadzba: c(r?.sadzba ?? r?.rate),
      zaklad: r2(c(r?.zaklad ?? r?.base)),
      dph: r2(c(r?.dph ?? r?.vat)),
      ...(r?.vat_category ? { vat_category: String(r.vat_category) } : {}),
      ...(r?.pdp === true ? { pdp: true } : {}),
    }));
  const zaklad = d.zaklad == null || d.zaklad === "" ? null : c(d.zaklad);
  const dph = d.dph == null || d.dph === "" ? 0 : c(d.dph);
  if (zaklad == null && !dph) return [];
  let sadzba = d.vat_rate == null || d.vat_rate === "" ? null : c(d.vat_rate);
  // Hlavička bez sadzby: odhad z pomeru (len na predvyplnenie, kontrola ho aj tak posúdi).
  if (sadzba == null) sadzba = zaklad ? Math.round((dph / zaklad) * 1000) / 10 : 0;
  return [{ sadzba, zaklad: r2(zaklad ?? 0), dph: r2(dph) }];
}

const KOD_CHYBY: Record<ChybaDph["kod"], VysledokKontroly["chyby"][number]["kod"]> = {
  sadzba: "neplatna_sadzba",
  dph: "riadok_dph",
  hlavicka: "suma_zakladov",
  chyba_rozpis: "neplatna_kategoria",
};

/**
 * Kontrola formulára pred uložením: pravidlo `skontrolujDph` (zákonná sadzba,
 * DPH zo základu, súčty = hlavička) a súčet podľa sadzieb voči sume vytlačenej
 * na doklade (`celkomDokladu`). Prázdne `chyby` = smie sa uložiť.
 */
export function kontrolaFormulara(v: {
  riadky: readonly RiadokRozpisu[];
  /** Hlavička; bez nej súčty rozpisu. */
  zaklad?: number | null;
  dph?: number | null;
  krajina: string | null | undefined;
  den?: string | null;
  poloziek?: number;
  krajinaDodavatela?: string | null;
  /** IČ DPH dodávateľa — keď krajina chýba, odvodí sa z prefixu. */
  icDphDodavatela?: string | null;
  /** Suma s DPH vytlačená na doklade (bez zaokrúhlenia bločku). */
  celkomDokladu?: number | string | null;
  mena?: string | null;
  hotovost?: boolean;
}): VysledokKontroly {
  const s = suctyRozpisu(v.riadky);
  const chyby = skontrolujDph({
    rozpis: v.riadky.length ? v.riadky.map((r) => ({ ...r })) : null,
    zaklad: v.zaklad ?? s.zaklad,
    dph: v.dph ?? s.dph,
    krajina: krajinaDane(v.krajina ?? "SK"),
    den: v.den ?? null,
    poloziek: v.poloziek,
    krajinaDodavatela: v.krajinaDodavatela ?? null,
    icDphDodavatela: v.icDphDodavatela ?? null,
  });
  const k: VysledokKontroly = {
    ok: chyby.length === 0,
    chyby: chyby.map((c) => ({ kod: KOD_CHYBY[c.kod], sprava: c.text })),
  };
  if (v.celkomDokladu == null || v.celkomDokladu === "" || !v.riadky.length) return k;
  return sNesuladomDokladu(
    k,
    v.riadky.map((r) => ({
      rate: r.sadzba,
      base: r.zaklad,
      vat: r.dph,
      vat_category: (r.pdp ? "reverse_charge" : r.vat_category) as never,
    })),
    v.celkomDokladu,
    v.mena,
    v.hotovost,
  );
}

/** Záporný riadok — odpočet zdanenej zálohy alebo dobropis. */
export function jeZapornyRiadok(r: Pick<RiadokRozpisu, "zaklad" | "dph">): boolean {
  return (Number(r.zaklad) || 0) < 0 || (Number(r.dph) || 0) < 0;
}

/**
 * Všetky zákonné sadzby, ktoré v krajine firmy niekedy platili (SK aj 20/10,
 * CZ aj 15/10), plus sadzby zahraničného dodávateľa. Záporný riadok (odpočet
 * zálohy z roku 2024 na faktúre z 2025) a dobropis/opravný doklad k pôvodnému
 * obdobiu ich smú niesť — tak to pustí aj pravidlo `skontrolujDph`.
 */
export function historickeSadzbyNaVyber(
  krajina: string | null | undefined,
  krajinaDodavatela?: string | null,
): number[] {
  const k = krajinaDane(krajina ?? "SK");
  const s = zakonneSadzby(k, null);
  const dod = String(krajinaDodavatela ?? "").trim().toUpperCase();
  const cudzie =
    dod && dod !== k
      ? dod === "SK" || dod === "CZ" || dod === "DE"
        ? zakonneSadzby(dod, null)
        : statEu(dod)
          ? sadzbyStatuSHistoriou(dod)
          : []
      : [];
  return [...new Set([...s, ...cudzie])].sort((a, b) => b - a);
}

/**
 * Sadzby, ktoré výber v riadku ponúkne: zákonné k dňu dodania; záporný riadok
 * alebo dobropis/opravný doklad aj historické (sadzby pôvodného obdobia).
 */
export function ponukaSadzieb(
  sadzby: readonly number[],
  historicke: readonly number[] | null | undefined,
  riadok: Pick<RiadokRozpisu, "zaklad" | "dph">,
  dobropis = false,
): number[] {
  const s = historicke?.length && (dobropis || jeZapornyRiadok(riadok)) ? [...sadzby, ...historicke] : [...sadzby];
  return [...new Set([...s, 0])].sort((a, b) => b - a);
}

/* ---------------------------------------------------------------------------
   Zaokrúhlenie celkovej sumy prijatej faktúry (haliérové v CZK, centové).
   Celkom = základ + DPH + zaokrúhlenie; purchase_invoices nemá vlastný stĺpec,
   zaokrúhlenie je rozdiel amount_total − (základ + DPH).
--------------------------------------------------------------------------- */

/** Zaokrúhlenie uloženej faktúry; mimo povolenej hranice 0 (prepočíta sa). */
export function pociatocneZaokruhlenie(
  celkom: unknown,
  zaklad: unknown,
  dph: unknown,
  mena?: string | null,
): number {
  const z = zaokruhlenieDokladu(celkom, zaklad, dph);
  return jePovoleneZaokruhlenie(z, mena) ? z : 0;
}

/** Celkom = základ + DPH + zaokrúhlenie (na centy). */
export function celkomSoZaokruhlenim(zaklad: number, dph: number, zaokruhlenie: number): number {
  return r2((Number(zaklad) || 0) + (Number(dph) || 0) + (Number(zaokruhlenie) || 0));
}

/**
 * Suma spolu po oprave rozpisu: uložená ostáva, keď sa od nového základu +
 * DPH líši najviac o povolené zaokrúhlenie (CZK 1 Kč, inak 0,50) — inak
 * súčet rozpisu.
 */
export function spoluPoOprave(stareSpolu: unknown, zaklad: number, dph: number, mena?: string | null): number {
  const stare = Number(stareSpolu);
  if (Number.isFinite(stare) && jePovoleneZaokruhlenie(zaokruhlenieDokladu(stare, zaklad, dph), mena))
    return r2(stare);
  return r2(zaklad + dph);
}

/** Polia prijatej faktúry, ktorých zmena znamená novú kontrolu DPH (ako spúšťač). */
export type DphPoliaPrijatej = {
  amount_without_vat: number | null;
  vat_amount: number | null;
  amount_total: number | null;
  rozpis: readonly RiadokRozpisu[];
  delivery_date: string | null;
  issue_date: string | null;
  currency: string | null;
  supplier_country: string | null;
  supplier_ic_dph: string | null;
  type: string | null;
  status: string | null;
};

/**
 * Zmenil človek pri úprave niečo, čo kontroluje pravidlo DPH? Keď nie,
 * formulár sumy ani rozpis neposiela a DPH nekontroluje — starú faktúru so
 * zmiešanou hlavičkou tak ide uložiť so zmenou splatnosti či poznámky
 * (rovnaká výnimka ako `skontrolujDphDokladu` so `stary` a spúšťač).
 * Prechod zo zálohovej alebo konceptu na ostrý doklad je zmena.
 */
export function zmenaDphPrijatej(stare: DphPoliaPrijatej, nove: DphPoliaPrijatej): boolean {
  const vynimka = (x: DphPoliaPrijatej) => x.type === "proforma" || x.status === "draft";
  if (vynimka(stare) && !vynimka(nove)) return true;
  const c = (v: number | null) => (v == null ? null : r2(Number(v)));
  const t = (v: string | null) => String(v ?? "").trim().toUpperCase();
  const rozpis = (r: readonly RiadokRozpisu[]) =>
    JSON.stringify(
      r.map((x) => [Number(x.sadzba) || 0, r2(Number(x.zaklad) || 0), r2(Number(x.dph) || 0), x.vat_category ?? null, x.pdp === true]),
    );
  return (
    c(stare.amount_without_vat) !== c(nove.amount_without_vat) ||
    c(stare.vat_amount) !== c(nove.vat_amount) ||
    c(stare.amount_total) !== c(nove.amount_total) ||
    rozpis(stare.rozpis) !== rozpis(nove.rozpis) ||
    t(stare.delivery_date) !== t(nove.delivery_date) ||
    t(stare.issue_date) !== t(nove.issue_date) ||
    t(stare.currency) !== t(nove.currency) ||
    t(stare.supplier_country) !== t(nove.supplier_country) ||
    t(stare.supplier_ic_dph) !== t(nove.supplier_ic_dph)
  );
}

const fmtSuma = (n: number) =>
  r2(n).toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Kontrola formulára prijatej faktúry pred uložením. `zmena: false` = pri
 * úprave sa nezmenilo nič, čo stráži pravidlo DPH — formulár sumy ani
 * rozpis neposiela a nekontroluje. Pri zmene súm je rozpis povinný
 * a zaokrúhlenie celkovej sumy musí byť v hranici (`maxZaokruhlenie`).
 */
export function kontrolaUlozeniaPrijatej(v: {
  /** Uložený stav pri úprave; null = nová faktúra. */
  povodne: DphPoliaPrijatej | null;
  aktualne: DphPoliaPrijatej;
  zaokruhlenie: number;
  krajina: string | null | undefined;
  poloziek?: number;
}): VysledokKontroly & { zmena: boolean } {
  const a = v.aktualne;
  if (a.type === "proforma" || a.status === "draft") return { ok: true, chyby: [], zmena: true };
  const zmena = !v.povodne || zmenaDphPrijatej(v.povodne, a);
  if (!zmena) return { ok: true, chyby: [], zmena };
  const chyby: VysledokKontroly["chyby"] = [];
  const zaklad = Number(a.amount_without_vat) || 0;
  const dph = Number(a.vat_amount) || 0;
  if (!a.rozpis.length && (Math.abs(zaklad) >= 0.005 || Math.abs(dph) >= 0.005))
    chyby.push({ kod: "neplatna_kategoria", sprava: "Doplňte rozpis DPH po sadzbách." });
  const mena = a.currency || "EUR";
  if (!jePovoleneZaokruhlenie(v.zaokruhlenie, mena))
    chyby.push({
      kod: "suma_dokladu",
      sprava: `Zaokrúhlenie ${fmtSuma(v.zaokruhlenie)} ${mena} je väčšie, než dovoľuje hranica ±${fmtSuma(maxZaokruhlenie(mena))} ${mena}.`,
    });
  const k = kontrolaFormulara({
    riadky: a.rozpis,
    zaklad,
    dph,
    krajina: v.krajina,
    den: a.delivery_date || a.issue_date || null,
    poloziek: v.poloziek,
    krajinaDodavatela: krajinaDodavatelaDph(a.supplier_country, a.supplier_ic_dph),
    celkomDokladu: a.amount_total == null ? null : r2(Number(a.amount_total) - (Number(v.zaokruhlenie) || 0)) || null,
    mena,
  });
  const vsetky = [...chyby, ...k.chyby];
  return { ok: vsetky.length === 0, chyby: vsetky, zmena };
}

/** Riadky, ktoré editor orámuje: sadzba mimo ponuky alebo DPH mimo zaokrúhlenia. */
export function zleRiadky(
  riadky: readonly RiadokRozpisu[],
  sadzby: readonly number[],
  /** Historické sadzby — záporný riadok (odpočet zálohy, dobropis) ich smie niesť. */
  historicke: readonly number[] = [],
): Set<number> {
  const zle = new Set<number>();
  riadky.forEach((r, i) => {
    const s = Number(r.sadzba) || 0;
    const ponuka = jeZapornyRiadok(r) ? [...sadzby, ...historicke] : sadzby;
    if (nesieDph(r) && !ponuka.some((x) => Math.abs(x - s) < 0.001)) zle.add(i);
    else if (Math.abs((Number(r.dph) || 0) - vypocitanaDph(r)) > DOLADENIE_DPH + 1e-9) zle.add(i);
  });
  return zle;
}

/**
 * Kontrola DPH nespracovaného dokladu pred vytvorením (web aj appka).
 * Zálohová faktúra (nie je daňový doklad) a „iný doklad“ sa nekontrolujú.
 */
export function kontrolaNespracovaneho(
  u: {
    rozpis: readonly RiadokRozpisu[];
    datumDodania?: string | null;
    datumVystavenia?: string | null;
    dodavatel?: { krajina?: string | null; icDph?: string | null } | null;
    celkom?: number | null;
    celkomDokladu?: number | null;
    zaokruhlenie?: number | null;
    mena?: string | null;
    platba?: string | null;
    polozky?: readonly unknown[] | null;
  },
  krajina: string | null | undefined,
  druh: string | null | undefined,
): VysledokKontroly {
  if (!druh || druh === "ostatny" || druh === "zalohova") return { ok: true, chyby: [] };
  const doklad = u.celkomDokladu ?? u.celkom;
  return kontrolaFormulara({
    riadky: u.rozpis ?? [],
    krajina,
    den: u.datumDodania || u.datumVystavenia || null,
    poloziek: u.polozky?.length || undefined,
    krajinaDodavatela: krajinaDodavatelaDph(u.dodavatel?.krajina, u.dodavatel?.icDph),
    celkomDokladu: doklad == null ? null : r2(Math.abs(Number(doklad)) - (Number(u.zaokruhlenie) || 0)),
    mena: u.mena,
    hotovost: u.platba === "hotovost",
  });
}
