/*
  Dátum prijatia prijatého dokladu a obdobie odpočtu DPH.

  Pravidlo (Patrik, 2. 11. 2026): odpočet DPH z prijatej faktúry patrí do
  obdobia neskoršieho z dátumov dodania (DUZP) a prijatia faktúry. Zákon to
  hovorí rovnako — SK § 51 ods. 1 písm. a) (odpočet najskôr v období, keď
  platiteľ faktúru má), CZ § 73 ZDPH (nárok sa uplatní najskôr za obdobie,
  v ktorom má plátce doklad), DE § 15 ods. 1 UStG (Vorsteuer až keď je
  plnenie dodané a faktúra v rukách).

  Výnimky:
  - prijatý dobropis opravuje odpočet v období prijatia (§ 53 ods. 2) — ako doteraz,
  - samozdanenie (prenesenie, nadobudnutie z EÚ) — daň aj odpočet vzniknú
    v tom istom období podľa dodania; posunúť len odpočet by rozbilo pár
    r. 09/r. 19 v priznaní,
  - bloček (`expense_documents`) — deň platby je zároveň deň prijatia.

  Tu je čistá logika pre výkazy, export do účtovníctva aj formuláre.
*/
import { dnesBratislava } from "./datum-vystavenia";

const den = (v: unknown): string => {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

/** Neskorší z dvoch dní (ISO); prázdny sa ignoruje. */
export function neskorsiDen(a: unknown, b: unknown): string | null {
  const x = den(a);
  const y = den(b);
  return (x > y ? x : y) || null;
}

export type PrijatyNaOdpocet = {
  issue_date?: string | null;
  delivery_date?: string | null;
  received_date?: string | null;
  opravuje_cislo?: string | null;
  amount_total?: number | string | null;
  dph_rezim?: string | null;
  reverse_charge?: boolean | null;
  vat_amount?: number | string | null;
};

/**
 * Je prijatý doklad celý samozdanený (daň aj odpočet podľa dodania)? Príznak
 * prenesenia na faktúre s daňou znamená zmiešanú faktúru — jej tuzemská časť
 * sa posúva podľa prijatia, prenesenú rieši výkaz zvlášť (ako `celaPdp`).
 */
export function jeSamozdanenie(
  p: Pick<PrijatyNaOdpocet, "dph_rezim" | "reverse_charge" | "vat_amount">,
): boolean {
  if (p.dph_rezim === "samozdanenie" || p.dph_rezim === "nadobudnutie") return true;
  return p.reverse_charge === true && !Number(p.vat_amount ?? 0);
}

/**
 * Deň, ktorým prijatý doklad vstupuje do odpočtu DPH:
 * - dobropis — dátum prijatia, inak vyhotovenia,
 * - samozdanenie — dátum dodania, inak vyhotovenia,
 * - ostatné — neskorší z dátumu dodania (bez neho vyhotovenia) a prijatia.
 */
export function denOdpoctu(p: PrijatyNaOdpocet): string | null {
  const dobropis = Boolean(p.opravuje_cislo) || Number(p.amount_total ?? 0) < 0;
  if (dobropis) return den(p.received_date) || den(p.issue_date) || den(p.delivery_date) || null;
  const plnenie = den(p.delivery_date) || den(p.issue_date);
  if (jeSamozdanenie(p)) return plnenie || null;
  return neskorsiDen(plnenie, p.received_date);
}

/** Obdobie odpočtu ako „MM/RRRR“ (napr. „09/2026“); bez dátumov `null`. */
export function obdobieOdpoctu(p: PrijatyNaOdpocet): string | null {
  const d = denOdpoctu(p);
  return d ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : null;
}

/** Je dátum prijatia skôr než dátum vystavenia? (varovanie vo formulári) */
export function prijatieSkorNezVystavenie(prijatie: unknown, vystavenie: unknown): boolean {
  const p = den(prijatie);
  const v = den(vystavenie);
  return Boolean(p && v && p < v);
}

/**
 * Predvolený dátum prijatia dokladu v Bratislave: pri doklade z e-mailu čas
 * prijatia mailu, inak čas nahratia (vytvorenia nespracovaného dokladu).
 * Okamih je ISO s časom — polnoc v Bratislave je ešte predošlý deň v UTC.
 */
export function predvolenyDatumPrijatia(r: {
  mailPrijaty?: string | null;
  nahrane?: string | null;
  teraz?: Date;
}): string {
  for (const v of [r.mailPrijaty, r.nahrane]) {
    if (!v) continue;
    const t = new Date(v);
    if (!Number.isNaN(t.getTime())) return dnesBratislava(t);
  }
  return dnesBratislava(r.teraz ?? new Date());
}
