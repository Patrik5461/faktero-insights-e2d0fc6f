/*
  Dátum daňovej povinnosti dokladu (`datum_dph`, od 18. 11. 2026).

  Účtovníčka chcela dátum, podľa ktorého doklad vstupuje do DPH, vidieť
  a upraviť priamo na doklade — prijatom aj vystavenom. Príklad: faktúra SFC
  s DUZP 31. 10., vystavená a doručená 2. 11. — patrí do októbra.

  - Vyplnený `datum_dph` určuje obdobie DPH (prehľad, priznanie, KV) aj
    dátum dane v exportoch (Pohoda `dateTax`, prijaté aj `dateKVDPH`).
  - Prázdny (`null`) = doterajšie pravidlo: prijatá `denOdpoctu` (neskorší
    z DUZP a prijatia; samozdanenie DUZP; dobropis prijatie), vystavená
    `denDaneVystavenej` (DUZP; opravná faktúra dátum vyhotovenia). Staré
    doklady sa teda nemenia.
  - Nové doklady ho dostanú predvyplnený (`predvolenyDatumDph`): prijatá
    DUZP (bez neho vystavenie), vystavená DUZP, opravná faktúra dátum
    vyhotovenia, daňový doklad k prijatej platbe deň platby.

  Jedno miesto pre výkazy, exporty, zámok obdobia aj formuláre.
*/
import { denOdpoctu, type PrijatyNaOdpocet } from "./datum-prijatia";
import { denDaneVystavenej } from "./dph-prehlad";

export type DruhDokladuDph = "prijata" | "vystavena";

const den = (v: unknown): string => {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

export type DokladNaDph = PrijatyNaOdpocet & {
  type?: string | null;
  opravuje_fakturu_id?: string | null;
  payment_date?: string | null;
  datum_dph?: string | null;
};

/**
 * Deň, ktorým doklad vstupuje do DPH: výslovný `datum_dph`, inak pravidlo
 * podľa druhu dokladu (prijatá — deň odpočtu, vystavená — deň dane).
 */
export function datumDphDokladu(d: DokladNaDph, druh: DruhDokladuDph): string | null {
  const vyslovny = den(d.datum_dph);
  if (vyslovny) return vyslovny;
  return druh === "prijata" ? denOdpoctu(d) : denDaneVystavenej(d);
}

/**
 * Predvyplnený dátum daňovej povinnosti nového dokladu (bez ohľadu na
 * uložený `datum_dph`):
 * - prijatá — DUZP, bez neho dátum vystavenia (dobropis: prijatie, inak vystavenie),
 * - vystavená — DUZP; opravná faktúra (dobropis, ťarchopis) dátum
 *   vyhotovenia; daňový doklad k prijatej platbe deň platby.
 */
export function predvolenyDatumDph(d: DokladNaDph, druh: DruhDokladuDph): string | null {
  if (druh === "prijata") {
    const dobropis = Boolean(d.opravuje_cislo) || Number(d.amount_total ?? 0) < 0;
    if (dobropis) return den(d.received_date) || den(d.issue_date) || den(d.delivery_date) || null;
    return den(d.delivery_date) || den(d.issue_date) || null;
  }
  if (d.type === "advance_payment") return den(d.payment_date) || denDaneVystavenej({ ...d, datum_dph: null });
  return denDaneVystavenej({ ...d, datum_dph: null });
}

/** Obdobie DPH ako „MM/RRRR“; bez dátumu `null`. */
export function obdobieDph(d: DokladNaDph, druh: DruhDokladuDph): string | null {
  const x = datumDphDokladu(d, druh);
  return x ? `${x.slice(5, 7)}/${x.slice(0, 4)}` : null;
}

/**
 * Líši sa dátum daňovej povinnosti od dátumu dodania? (nápoveda vo
 * formulári). Prázdny ktorýkoľvek z nich = nelíši sa.
 */
export function datumDphSaLisiOdDodania(datumDph: unknown, dodanie: unknown): boolean {
  const a = den(datumDph);
  const b = den(dodanie);
  return Boolean(a && b && a !== b);
}

/** Je hodnota platný dátum ISO (RRRR-MM-DD)? Prázdna/neplatná → `null`. */
export function normalizujDatumDph(v: unknown): string | null {
  return den(v) || null;
}

/**
 * Pole formulára, ktoré nasleduje DUZP, kým ho používateľ nezmení:
 * vráti nový `datum_dph` po zmene dátumu dodania. Ak sa doterajšia hodnota
 * rovnala predošlému predvolenému dňu (alebo bola prázdna), posunie sa
 * s ním; ručne zadaný iný dátum ostane.
 */
export function datumDphPoZmeneDodania(
  aktualny: string | null | undefined,
  starePredvolene: string | null | undefined,
  novePredvolene: string | null | undefined,
): string {
  const a = den(aktualny);
  if (!a || a === den(starePredvolene)) return den(novePredvolene);
  return a;
}
