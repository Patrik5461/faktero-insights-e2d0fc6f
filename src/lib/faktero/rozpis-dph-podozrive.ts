/**
 * Podozrivý rozpis DPH — aj keď súčty sedia.
 *
 * `skontrolujRozpisDph` (rozpis-dph-kontrola.ts) chytí rozpis, ktorý nesedí
 * so sumami alebo so sadzbou. Vyťaženie však vie vrátiť aj rozpis, ktorý je
 * aritmeticky v poriadku, a predsa zlý: celý základ v jednej sadzbe, hoci
 * položky majú dve, alebo 19 % na doklade, kde 19 % nikde nie je. Tieto
 * doklady opravný skript (`scripts/oprava-rozpisu-dph.ts`) pošle na nové
 * vyťaženie a výsledok musí znova prejsť kontrolou.
 *
 * Čistá logika bez I/O. Text dokladu (textová vrstva PDF) je voliteľný —
 * bez neho sa niektoré podozrenia nedajú overiť a vrátia sa s kódom
 * `..._neoverena`, aby ich report vedel spočítať zvlášť.
 */
import { jePrenesenieZTextu, type RiadokDph } from "./rozpis-dph-kontrola";
import { krajinaDane, sadzbyKrajiny } from "./vat-rates";

export type KodPodozrenia =
  /** SK od 1. 1. 2025: 19 % v rozpise, ale na doklade (text) 19 % nie je. */
  | "sadzba_19_nie_je_na_doklade"
  /** SK od 1. 1. 2025: 19 % v rozpise a text dokladu nie je k dispozícii. */
  | "sadzba_19_neoverena"
  /** Rozpis má jednu sadzbu, položky dokladu majú viac sadzieb. */
  | "jedna_sadzba_pri_viacerych"
  /** Položky alebo text majú 0 % / 5 %, rozpis takú sadzbu nemá. */
  | "chyba_sadzba"
  /** Text hovorí o prenesení daňovej povinnosti, doklad ho nemá označené. */
  | "prenesenie_bez_priznaku"
  /**
   * Jediný riadok DPH, pri ktorom daň nevychádza zo základu pri žiadnej
   * povolenej sadzbe — typicky zlúčené „Nie je predmetom DPH“ s 23 %
   * (384,39 / 5,61 → „1,46 %“).
   */
  | "efektivna_sadzba";

export type Podozrenie = { kod: KodPodozrenia; sprava: string };

export type VstupPodozrenia = {
  /** Uložený rozpis (riadky s nulovým základom aj daňou sa ignorujú). */
  rozpis: RiadokDph[];
  /** Položky dokladu (`items`) — sadzba a suma riadku. */
  polozky?:
    | {
        vat_rate?: unknown;
        total?: unknown;
        quantity?: unknown;
        unit_price?: unknown;
        name?: unknown;
      }[]
    | null;
  /** Krajina sadzieb (firmy alebo dodávateľa). */
  krajina: string;
  /** Dátum dodania (bez neho vystavenia). */
  datumDodania?: string | null;
  /** Text dokladu (textová vrstva PDF); `null` = nie je k dispozícii. */
  text?: string | null;
  /** Doklad je už označený ako prenesenie daňovej povinnosti. */
  reverseCharge?: boolean;
};

const ZACIATOK_2025 = "2025-01-01";

const cislo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v);
  return Number.isFinite(n) ? n : null;
};

const ciarka = (n: number) => n.toFixed(2).replace(".", ",");
const fmtSadzby = (s: number[]) => s.map((x) => `${x} %`).join(", ");

/** Riadky rozpisu, ktoré niečo nesú. */
function nenuloveRiadky(r: RiadokDph[]): RiadokDph[] {
  return (r ?? []).filter(
    (x) => Math.abs(cislo(x.base) ?? 0) >= 0.005 || Math.abs(cislo(x.vat) ?? 0) >= 0.005,
  );
}

/** Sadzby položiek s nenulovou sumou (zaokrúhlenie a prázdne riadky nie). */
export function sadzbyPoloziek(polozky: VstupPodozrenia["polozky"]): number[] {
  const out = new Set<number>();
  for (const p of polozky ?? []) {
    const s = cislo(p?.vat_rate);
    if (s === null) continue;
    const meno = String(p?.name ?? "").toLowerCase();
    if (/zaokr[uú]hl|rounding/.test(meno)) continue;
    const t = cislo(p?.total) ?? (cislo(p?.quantity) ?? 1) * (cislo(p?.unit_price) ?? 0);
    if (Math.abs(t) < 0.005) continue;
    out.add(s);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Sadzby DPH spomenuté v texte dokladu: percentá z množiny platných sadzieb
 * krajiny, ktoré stoja na riadku so slovom DPH/VAT/daň/sadzba (alebo v
 * tabuľke rozpisu „Základ … DPH“). Zľava „5 %“ na inom riadku sa nepočíta.
 */
export function sadzbyZTextu(text: string | null | undefined, krajina: string): number[] {
  if (!text) return [];
  const k = krajinaDane(krajina);
  const platne = new Set([...sadzbyKrajiny(k, "2000-01-01"), ...sadzbyKrajiny(k)]);
  const out = new Set<number>();
  const riadky = String(text).split(/\r?\n/);
  const kluc = /(dph|d\.p\.h|vat|mwst|ust\b|da[nň]|sadzb|sazb|z[aá]klad)/i;
  riadky.forEach((riadok, i) => {
    // Hlavička tabuľky rozpisu býva niekoľko riadkov vyššie (riadok na sadzbu).
    const okolie = riadky.slice(Math.max(0, i - 4), i + 1).join(" ");
    if (!kluc.test(okolie)) return;
    for (const m of riadok.matchAll(/(?<![\d.,])(\d{1,2})(?:[.,]0{1,2})?\s?%/g)) {
      const s = Number(m[1]);
      if (platne.has(s)) out.add(s);
    }
  });
  return [...out].sort((a, b) => a - b);
}

/** Je na doklade (v texte) sadzba 19 %? */
export function textMa19(text: string): boolean {
  return /(?<![\d.,])19(?:[.,]0{1,2})?\s?%/.test(text);
}

/**
 * Podozrenia nad uloženým rozpisom. Prázdny zoznam = nič podozrivé.
 * Aritmetiku (súčty, daň riadku, platnosť sadzby) rieši `skontrolujRozpisDph`.
 */
export function najdiPodozrenia(v: VstupPodozrenia): Podozrenie[] {
  const out: Podozrenie[] = [];
  const krajina = krajinaDane(v.krajina);
  const riadky = nenuloveRiadky(v.rozpis);
  const sadzbyRozpisu = [...new Set(riadky.map((r) => cislo(r.rate) ?? 0))].sort((a, b) => a - b);
  const maText = typeof v.text === "string" && v.text.trim().length > 20;
  const text = maText ? String(v.text) : "";
  const den = v.datumDodania ? String(v.datumDodania).slice(0, 10) : null;
  const polozky = sadzbyPoloziek(v.polozky);
  const zTextu = sadzbyZTextu(text, krajina);

  // 1. Slovenských 19 % od 2025 — AI ich rada „dopočíta“ z pomeru dane k základu.
  if (krajina === "SK" && den && den >= ZACIATOK_2025 && sadzbyRozpisu.includes(19)) {
    if (maText) {
      if (!textMa19(text) && !polozky.includes(19)) {
        out.push({
          kod: "sadzba_19_nie_je_na_doklade",
          sprava: "V rozpise je 19 %, ale na doklade sa sadzba 19 % nenachádza.",
        });
      }
    } else if (!polozky.includes(19) || polozky.length === 0) {
      out.push({
        kod: "sadzba_19_neoverena",
        sprava: "V rozpise je 19 % a z dokladu sa nedá overiť, že tam naozaj je.",
      });
    }
  }

  // 1b. Jediný riadok s daňou, ku ktorej sa nehodí žiadna povolená sadzba.
  const sDanou = riadky.filter((r) => Math.abs(cislo(r.vat) ?? 0) >= 0.005);
  if (riadky.length === 1 && sDanou.length === 1) {
    const base = cislo(sDanou[0]!.base) ?? 0;
    const vat = cislo(sDanou[0]!.vat) ?? 0;
    const povolene = sadzbyKrajiny(krajina, den);
    if (base && !povolene.some((s) => s > 0 && Math.abs((base * s) / 100 - vat) <= 0.02 + 1e-9)) {
      const ef = Math.round((vat / base) * 10000) / 100;
      out.push({
        kod: "efektivna_sadzba",
        sprava: `Daň ${ciarka(vat)} zo základu ${ciarka(base)} je ${String(ef).replace(".", ",")} % — nezodpovedá žiadnej sadzbe (${fmtSadzby(povolene.filter((s) => s > 0))}); doklad má asi viac druhov plnenia.`,
      });
    }
  }

  // 2. Celý základ v jednej sadzbe, položky majú viac sadzieb.
  if (sadzbyRozpisu.length === 1 && polozky.length > 1) {
    out.push({
      kod: "jedna_sadzba_pri_viacerych",
      sprava: `Rozpis má len ${sadzbyRozpisu[0]} %, položky majú sadzby ${fmtSadzby(polozky)}.`,
    });
  } else if (
    sadzbyRozpisu.length === 1 &&
    zTextu.length > 1 &&
    !zTextu.every((s) => sadzbyRozpisu.includes(s))
  ) {
    out.push({
      kod: "jedna_sadzba_pri_viacerych",
      sprava: `Rozpis má len ${sadzbyRozpisu[0]} %, na doklade sú sadzby ${fmtSadzby(zTextu)}.`,
    });
  }

  // 3. Chýbajúca 0 % alebo 5 % (nulová položka, kniha, potraviny…).
  if (riadky.length) {
    const chybaju = [0, 5].filter(
      (s) => !sadzbyRozpisu.includes(s) && (polozky.includes(s) || zTextu.includes(s)),
    );
    // Pri 5 % musí byť sadzba v krajine (CZ 5 % nemá) — zabezpečí to sadzbyZTextu/položky.
    if (chybaju.length && !out.some((p) => p.kod === "jedna_sadzba_pri_viacerych")) {
      out.push({
        kod: "chyba_sadzba",
        sprava: `Na doklade je sadzba ${fmtSadzby(chybaju)}, v rozpise chýba.`,
      });
    }
  }

  // 4. Prenesenie daňovej povinnosti napísané na doklade, ale neoznačené.
  // Zmiešaná faktúra s prenesenou položkou (betonárska oceľ) už prenesenie má.
  const maPrenesenyRiadok = riadky.some((r) => r.vat_category === "reverse_charge");
  if (maText && !v.reverseCharge && !maPrenesenyRiadok && jePrenesenieZTextu(text)) {
    out.push({
      kod: "prenesenie_bez_priznaku",
      sprava: "Na doklade je text o prenesení daňovej povinnosti, doklad ho nemá označené.",
    });
  }
  return out;
}
