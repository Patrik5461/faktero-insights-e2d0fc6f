/*
  Deterministické nápravy rozpisu DPH z vyťaženia (13. 11. 2026).

  Patrik: „Faktero načítava nesprávnu DPH z faktúr — nedovoľ prepisovať
  zákonné sadzby DPH.“ Kontrola rozpisu (`skontrolujRozpisDph`) chybu nájde;
  tu sú opravy, ktoré sa dajú urobiť bez človeka, lebo čísla na doklade
  pripúšťajú jediný výklad. Čo sa takto opraviť nedá, ide na kontrolu —
  nikdy sa neuloží sadzba mimo zákonných a nikdy sa sadzba nedopočítava
  ako pomer DPH / základ (overujú sa len zákonné sadzby, jedna po druhej).

  (a) Odpočet NEZDANENEJ zálohy omylom v základe — Tempus-Car 40260037:
      rekapitulácia mala odpočet −14 980 v stĺpci „Nie je predmetom DPH“,
      základ vyšiel 60 894,31 − 14 980 = 45 914,31 pri DPH 14 005,69 → „30,5 %“.
      Keď DPH sedí na (základ + záloha) × zákonná sadzba, záloha ide do
      odpočtu zálohy (`advance_deduction`) a základ je celý.
  (b) Základ riadku uvedený S DPH (DPH sedí na (základ − DPH) × sadzba).
  (c) Chýbajúci riadok 0 % / nie je predmetom / prenesenie — súčet základov
      riadkov je menší ako základ dokladu, DPH sedí: rozdiel je riadok bez
      dane (pri doklade s vetou o prenesení `reverse_charge`, inak podľa
      položiek, inak `needs_review` → na kontrolu).

  Čisté funkcie bez I/O.
*/
import {
  jeKategoriaDph,
  jePrenesenieZTextu,
  type KategoriaDph,
} from "./rozpis-dph-kontrola";
import { jeZnamaSadzba, krajinaDane, sadzbyKrajiny } from "./vat-rates";
import { sadzbyStatuSHistoriou, statEu } from "./sadzby-eu";
import { dphZoZakladu, toleranciaRiadku } from "./dph-pravidlo";

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const blizko = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol + 1e-9;

/* Spoločné pravidlo DPH (agent „Pravidlo a databáza“) — daň riadku a tolerancia. */
export { dphZoZakladu, toleranciaRiadku };

/** DPH riadku sedí na základ × sadzba (v tolerancii)? */
export function dphSedi(zaklad: number, sadzba: number, dph: number, poloziek?: number | null): boolean {
  return blizko(dphZoZakladu(zaklad, sadzba), dph, toleranciaRiadku(poloziek));
}

/** Zákonné sadzby nad nulou platné pre krajinu a deň. */
function kladneSadzby(krajina?: string | null, den?: string | null): number[] {
  const d = den && /^\d{4}-\d{2}-\d{2}/.test(den) ? den.slice(0, 10) : null;
  return sadzbyKrajiny(krajinaDane(krajina ?? "SK"), d).filter((s) => s > 0);
}

/** Jediná zákonná sadzba, pri ktorej DPH zo základu vychádza; inak null. */
export function jedinaSediacaSadzba(
  zaklad: number,
  dph: number,
  kontext: { krajina?: string | null; den?: string | null; poloziek?: number | null },
): number | null {
  if (!(Math.abs(zaklad) > 0.004) || !(Math.abs(dph) > 0.004)) return null;
  const sedia = kladneSadzby(kontext.krajina, kontext.den).filter((s) =>
    dphSedi(Math.abs(zaklad), s, Math.abs(dph), kontext.poloziek),
  );
  return sedia.length === 1 ? sedia[0]! : null;
}

/* ------------------------------------------------------------------------
   (a) Odpočet nezdanenej zálohy v základe
------------------------------------------------------------------------ */

/** Text, ktorý prezrádza odpočet zálohy (riadok rozpisu, položka). */
/* „ZF“ len s číslom a veľkými písmenami (ako `TEXT_ODPOCTU_ZALOHY`) — „ZF olej“ je značka. */
const TEXT_ZALOHY = {
  test: (text: string): boolean =>
    /(z[aá]loh|predplat|preddav|advance|prepaid|deposit|\bZAL\b|odpo[cč][ií]tan)/i.test(text) ||
    /\bZF\s*(?:č\.?|c\.)\s*\d|\bZF\s*[-.\/]?\s*\d{3,}/.test(text),
};

const nazovRiadku = (x: any) => String(x?.label ?? x?.column ?? x?.name ?? x?.text ?? "");

/** Odpočet nezdanenej zálohy uvedený AI (kladne) a jeho číslo. */
function zalohaOdAi(ai: Record<string, unknown>): { suma: number; cislo: string } | null {
  const surove = ai.advance_deduction ?? ai.advance_deductions;
  const zoznam = (Array.isArray(surove) ? surove : surove && typeof surove === "object" ? [surove] : []) as any[];
  const nezdanene = zoznam.filter(
    (x) => x && x.taxed !== true && !(Math.abs(num(x.vat) ?? 0) > 0.004),
  );
  if (!nezdanene.length) return null;
  const suma = r2(nezdanene.reduce((a, x) => a + Math.abs(num(x.amount ?? x.total) ?? 0), 0));
  if (!(suma > 0)) return null;
  return {
    suma,
    cislo: nezdanene
      .map((x) => String(x.advance_invoice_number ?? x.number ?? "").trim())
      .filter(Boolean)
      .join(", "),
  };
}

/** Záporné položky bez dane s textom o zálohe („ZF 9180431“, „Odpočet zálohy“). */
function zalohovePolozky(ai: Record<string, unknown>): { suma: number; cislo: string } | null {
  const items = Array.isArray(ai.items) ? (ai.items as any[]) : [];
  const z = items.filter((p) => {
    const suma = num(p?.total) ?? num(p?.unit_price);
    return suma != null && suma < 0 && !((num(p?.vat_rate) ?? 0) > 0) && TEXT_ZALOHY.test(String(p?.name ?? ""));
  });
  if (!z.length) return null;
  const cislo = z
    .map((p) => String(p?.name ?? "").match(/\d{5,}/)?.[0] ?? "")
    .filter(Boolean)
    .join(", ");
  return { suma: r2(z.reduce((a, p) => a + Math.abs(num(p?.total) ?? num(p?.unit_price) ?? 0), 0)), cislo };
}

export type NapravaZalohy = { ai: Record<string, unknown>; naprava: string | null };

/**
 * Odpočet nezdanenej zálohy, ktorý AI zapísala do rozpisu DPH alebo do
 * základu, presunie do `advance_deduction` a vráti celý základ. Volá sa
 * pred `aiSOdpoctomZalohy`. Keď vzťahy čísel nepotvrdia zálohu, nemení nič.
 */
export function napravZalohuVZaklade(
  ai: Record<string, unknown>,
  kontext: { krajina?: string | null; den?: string | null } = {},
): NapravaZalohy {
  const den =
    kontext.den ??
    ([ai.delivery_date, ai.issue_date].find((x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}/.test(x)) as
      | string
      | undefined) ??
    null;
  const kx = { krajina: kontext.krajina, den };
  let out: Record<string, unknown> = ai;
  const napravy: string[] = [];
  const odAi = zalohaOdAi(ai);
  const zPoloziek = zalohovePolozky(ai);

  /*
    1. Záporný riadok rozpisu bez dane (0 %, „Nie je predmetom DPH“,
       „Oslobodené“) = odpočet zálohy, keď ho potvrdí odpočet od AI, zálohová
       položka alebo text riadku. Prenesenie (`reverse_charge`) nie — to je
       skutočné plnenie (dobropisovaná položka v PDP).
  */
  const pole = Array.isArray(ai.vat_breakdown) ? (ai.vat_breakdown as any[]) : [];
  const jeZapornyBezDane = (x: any) => {
    const zaklad = num(x?.base ?? x?.zaklad) ?? 0;
    const dph = num(x?.vat ?? x?.dph) ?? 0;
    const kat = x?.vat_category ?? x?.category;
    const sadzba = num(x?.rate ?? x?.sadzba) ?? 0;
    return zaklad < 0 && Math.abs(dph) < 0.005 && kat !== "reverse_charge" && (sadzba === 0 || kat === "out_of_scope" || kat === "exempt");
  };
  const zaporne = pole.filter(jeZapornyBezDane);
  const ostatne = pole.filter((x) => !jeZapornyBezDane(x));
  if (zaporne.length && ostatne.length) {
    const A = r2(zaporne.reduce((a, x) => a + Math.abs(num(x?.base ?? x?.zaklad) ?? 0), 0));
    const kladnyZaklad = r2(ostatne.reduce((a, x) => a + (num(x?.base ?? x?.zaklad) ?? 0), 0));
    const potvrdene =
      (odAi && blizko(odAi.suma, A)) ||
      (zPoloziek && blizko(zPoloziek.suma, A)) ||
      zaporne.every((x) => TEXT_ZALOHY.test(nazovRiadku(x)));
    if (potvrdene && kladnyZaklad > A) {
      out = { ...out, vat_breakdown: ostatne };
      const z0 = num(ai.amount_without_vat);
      if (z0 != null && blizko(z0, kladnyZaklad - A)) out.amount_without_vat = kladnyZaklad;
      if (!odAi)
        out.advance_deduction = {
          amount: A,
          advance_invoice_number: zPoloziek?.cislo || null,
          taxed: false,
          base: null,
          vat: null,
          rate: null,
        };
      napravy.push(
        `Odpočet zálohy ${fmt(A)} bol v rozpise DPH ako riadok bez dane — presunutý do odpočtu zálohy.`,
      );
    }
  }

  /*
    2. Základ hlavičky znížený o zálohu, DPH z celého plnenia:
       DPH ≠ základ × sadzba pri žiadnej zákonnej sadzbe, ale
       DPH = (základ + záloha) × práve jedna zákonná sadzba.
  */
  const A = zalohaOdAi(out)?.suma ?? zPoloziek?.suma ?? null;
  const z = num(out.amount_without_vat);
  const d = num(out.vat_amount);
  const rozpisSadzby = new Set(
    (Array.isArray(out.vat_breakdown) ? (out.vat_breakdown as any[]) : [])
      .map((x) => num(x?.rate ?? x?.sadzba) ?? 0)
      .filter((x) => x > 0),
  );
  // Viac sadzieb s daňou — jedna sadzba na celý základ nedáva zmysel, nič sa nehádá.
  if (A && z != null && d != null && Math.abs(d) > 0.004 && z > 0 && rozpisSadzby.size <= 1) {
    const sedia = kladneSadzby(kx.krajina, kx.den).filter((s) => dphSedi(z, s, d));
    const sZalohou = jedinaSediacaSadzba(z + A, d, kx);
    if (!sedia.length && sZalohou != null) {
      const cely = r2(z + A);
      out = { ...out, amount_without_vat: cely };
      const t = num(out.amount_total);
      // Suma dokladu tiež po odpočte (= základ + DPH)? Celé plnenie je o zálohu vyššie.
      if (t != null && blizko(t, z + d)) out.amount_total = r2(cely + d);
      if (num(out.amount_due) == null) out.amount_due = r2(cely + d - A);
      // Rozpis s jedným riadkom tej sadzby a základom po odpočte → celý základ.
      const rozpis = Array.isArray(out.vat_breakdown) ? (out.vat_breakdown as any[]) : [];
      const i = rozpis.findIndex((x) => num(x?.rate ?? x?.sadzba) === sZalohou);
      if (i >= 0 && blizko(num(rozpis[i]?.base ?? rozpis[i]?.zaklad) ?? 0, z - sumaInych(rozpis, i)))
        out.vat_breakdown = rozpis.map((x, j) => (j === i ? { ...x, base: r2((num(x?.base ?? x?.zaklad) ?? 0) + A) } : x));
      if (!zalohaOdAi(out))
        out.advance_deduction = {
          amount: A,
          advance_invoice_number: zPoloziek?.cislo || null,
          taxed: false,
          base: null,
          vat: null,
          rate: null,
        };
      napravy.push(
        `Základ ${fmt(z)} bol znížený o odpočet zálohy ${fmt(A)}, DPH ${fmt(d)} je z celého základu ${fmt(cely)} pri ${sZalohou} % — záloha presunutá do odpočtu zálohy.`,
      );
    }
  }
  return { ai: out, naprava: napravy.length ? napravy.join(" ") : null };
}

function sumaInych(rozpis: any[], i: number): number {
  return rozpis.reduce((a, x, j) => (j === i ? a : a + (num(x?.base ?? x?.zaklad) ?? 0)), 0);
}

const fmt = (n: number) =>
  r2(n).toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ------------------------------------------------------------------------
   (b) + (c) Náprava rozpisu po sadzbách
------------------------------------------------------------------------ */

export type RiadokNapravy = { sadzba: number; zaklad: number; dph: number; vat_category: KategoriaDph };

/** Dane sa týka len zdaniteľný riadok (a neurčený nad nulou). */
const sDanou = (r: RiadokNapravy) =>
  r.sadzba > 0 && (r.vat_category === "standard" || r.vat_category === "needs_review");

/**
 * Kategória chýbajúceho riadku bez dane: doklad s vetou o prenesení →
 * prenesenie; položky bez dane s jednou uvedenou kategóriou → tá; inak
 * `needs_review` (doklad ide na kontrolu, človek určí dôvod).
 */
function kategoriaChybajuceho(ai: Record<string, unknown>): KategoriaDph {
  const text = [ai.reverse_charge_text, ai.vat_note, ai.note].filter((x) => typeof x === "string").join(" ");
  if (ai.reverse_charge === true || jePrenesenieZTextu(text)) return "reverse_charge";
  const items = Array.isArray(ai.items) ? (ai.items as any[]) : [];
  const bezDane = items.filter((p) => !((num(p?.vat_rate) ?? 0) > 0) || p?.reverse_charge === true);
  const kat = new Set(
    bezDane.map((p) =>
      p?.reverse_charge === true ? "reverse_charge" : jeKategoriaDph(p?.vat_category) ? p.vat_category : "needs_review",
    ),
  );
  if (kat.size === 1) {
    const k = [...kat][0] as KategoriaDph;
    return k === "standard" ? "needs_review" : k;
  }
  return "needs_review";
}

/**
 * Náprava rozpisu, ktorý neprešiel kontrolou. Vráti opravený rozpis a vety,
 * čo sa zmenilo, alebo null, keď nebolo čo opraviť. Sadzby sa nemenia —
 * nesprávna sadzba sa nikdy „neopraví“ na inú, ide na kontrolu.
 */
export function napravRozpisDph(
  rozpis: RiadokNapravy[],
  sumy: { bezDph: number; dph: number },
  ai: Record<string, unknown>,
  poloziek?: number | null,
): { rozpis: RiadokNapravy[]; naprava: string } | null {
  const napravy: string[] = [];
  let riadky = rozpis.map((r) => ({ ...r }));

  // (b) Základ riadku uvedený s DPH.
  riadky = riadky.map((r) => {
    if (!sDanou(r) || !(r.dph > 0) || dphSedi(r.zaklad, r.sadzba, r.dph, poloziek)) return r;
    const zaklad = r2(r.zaklad - r.dph);
    if (zaklad > 0 && dphSedi(zaklad, r.sadzba, r.dph, poloziek)) {
      napravy.push(`Základ pri ${r.sadzba} % bol uvedený s DPH (${fmt(r.zaklad)}) — správne ${fmt(zaklad)}.`);
      return { ...r, zaklad };
    }
    return r;
  });

  // (c) Chýbajúci riadok bez dane.
  const vsetkySedia = riadky.every((r) => !sDanou(r) || dphSedi(r.zaklad, r.sadzba, r.dph, poloziek));
  const sumZ = r2(riadky.reduce((a, r) => a + r.zaklad, 0));
  const sumD = r2(riadky.reduce((a, r) => a + r.dph, 0));
  const rozdiel = r2(sumy.bezDph - sumZ);
  if (vsetkySedia && rozdiel > 0.02 && blizko(sumD, sumy.dph)) {
    const kat = kategoriaChybajuceho(ai);
    const i = riadky.findIndex((r) => r.sadzba === 0 && r.vat_category === kat);
    if (i >= 0) riadky[i] = { ...riadky[i]!, zaklad: r2(riadky[i]!.zaklad + rozdiel) };
    else riadky.push({ sadzba: 0, zaklad: rozdiel, dph: 0, vat_category: kat });
    napravy.push(
      `V rozpise chýbal riadok bez dane so základom ${fmt(rozdiel)} (${kat === "reverse_charge" ? "prenesenie daňovej povinnosti" : kat === "out_of_scope" ? "nie je predmetom DPH" : kat === "exempt" ? "oslobodené" : "dôvod treba určiť"}).`,
    );
  }
  if (!napravy.length) return null;
  return { rozpis: riadky, naprava: napravy.join(" ") };
}

/**
 * Poistka pred uložením: sadzba sa nikdy „neopraví“ na nepreverenú.
 *  - Sadzba zákonná (pre zahraničného dodávateľa zo štátu EÚ aj historická) → ostáva.
 *  - Záporný riadok s historickou sadzbou krajiny → ostáva.
 *  - Riadok bez dane s dôvodom (oslobodené, mimo DPH, prenesenie) → 0 %.
 *  - DPH zo základu sedí práve na jednu zákonnú sadzbu → tá (overenie, nie pomer).
 *  - Inak ostáva PÔVODNÁ sadzba, ktorú model prečítal — kontrola ju ohlási,
 *    editor ju ukáže „– neplatná“, doklad ostane v Nespracovaných (zápis ho
 *    spúšťač neprijme) a človek sadzbu opraví. Pôvodná sadzba sa nezahadzuje.
 *  - Riadok 0 % s nenulovou DPH (sadzbu nikto neuviedol, napr. rozpis zo súm
 *    pri zmiešaných sadzbách) nevznikne nikdy: základ ostane v riadku 0 %
 *    `needs_review` s DPH 0 — súčet DPH rozpisu potom nesedí s hlavičkou
 *    (DPH dokladu ostáva v sumách) a doklad ide na kontrolu. Riadok
 *    „0 % a DPH 26,88“ by netvrdil ani jedno.
 */
export function lenZakonneSadzby<T extends { sadzba: number; zaklad: number; dph: number; vat_category: KategoriaDph }>(
  rozpis: T[],
  kontext: {
    krajina?: string | null;
    den?: string | null;
    /** Krajina dodávateľa (ISO) — zahraničná DPH (hotel v Rakúsku) nesie sadzby svojho štátu. */
    krajinaDodavatela?: string | null;
  },
): T[] {
  const d = kontext.den && /^\d{4}-\d{2}-\d{2}/.test(kontext.den) ? kontext.den.slice(0, 10) : null;
  const krajina = krajinaDane(kontext.krajina ?? "SK");
  const kd = String(kontext.krajinaDodavatela ?? "").trim().toUpperCase();
  const cudzi = !!kd && kd !== krajina;
  // Dodávateľ mimo EÚ (a mimo tabuliek) — sadzby nevieme overiť (ako v pravidle), len 0 % s DPH vypadne.
  const neznamy = cudzi && kd !== "SK" && kd !== "CZ" && kd !== "DE" && !statEu(kd);
  const povolene: number[] | null = neznamy
    ? null
    : cudzi
      ? kd === "SK" || kd === "CZ" || kd === "DE"
        ? sadzbyKrajiny(kd, d)
        : sadzbyStatuSHistoriou(kd)
      : sadzbyKrajiny(krajina, d);
  const jeV = (zoznam: number[], s: number) => zoznam.some((x) => Math.abs(x - s) < 0.001);
  const sDph = (r: T) => Math.abs(r.dph) > 0.004;
  const vysledok: T[] = [];
  for (const r of rozpis) {
    if (r.sadzba === 0 && sDph(r)) {
      // Sadzbu nikto neuviedol a DPH je nenulová — overiť sa dá jedine zákonnou sadzbou.
      const s = povolene ? jedinaSediaca(r, povolene) : null;
      if (s != null) vysledok.push({ ...r, sadzba: s, vat_category: "standard" as KategoriaDph });
      else vysledok.push({ ...r, dph: 0, vat_category: "needs_review" as KategoriaDph });
      continue;
    }
    if (povolene === null || jeV(povolene, r.sadzba)) {
      vysledok.push(r);
      continue;
    }
    // Záporný riadok (odpočet zdanenej zálohy zo staršieho obdobia) smie niesť historickú sadzbu.
    if ((r.zaklad < 0 || r.dph < 0) && (cudzi ? jeV(povolene, r.sadzba) : jeZnamaSadzba(r.sadzba, krajina))) {
      vysledok.push(r);
      continue;
    }
    // Riadok bez dane (oslobodené, mimo DPH, prenesenie) — 0 % je vždy zákonná.
    if (!sDph(r) && r.vat_category !== "standard" && r.vat_category !== "needs_review") {
      vysledok.push({ ...r, sadzba: 0 });
      continue;
    }
    const s = jedinaSediaca(r, povolene);
    if (s != null) vysledok.push({ ...r, sadzba: s, vat_category: "standard" as KategoriaDph });
    else vysledok.push(r); // pôvodná (neplatná) sadzba ostáva — kontrola a editor ju ukážu
  }
  return vysledok;

  function jedinaSediaca(r: T, zoznam: number[]): number | null {
    if (!(Math.abs(r.zaklad) > 0.004) || !sDph(r)) return null;
    const sedia = zoznam.filter((s) => s > 0 && dphSedi(Math.abs(r.zaklad), s, Math.abs(r.dph)));
    return sedia.length === 1 ? sedia[0]! : null;
  }
}

