/*
  Prijaté eFaktúry v appke — stav riadku, filter a hlásenie po zaevidovaní.

  Zoznam aj zaevidovanie idú cez tie isté serverové funkcie ako web
  (`listPrijateEfakturyFn`, `zaevidujPrijatuEfakturuFn`), tu je len to, čo
  appka z výsledku ukazuje. Čisté funkcie bez Reactu — testy v
  `efaktury-prijate.test.ts`.
*/

import type { Kluc } from "./preklady";

/** Riadok z `listPrijateEfakturyFn`. */
export type PrijataEfakturaApp = {
  id: string;
  sender_name: string | null;
  sender_participant_id: string | null;
  document_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  currency: string | null;
  total: number | string | null;
  vat_total: number | string | null;
  status: string | null;
  received_at: string | null;
  matched_supplier_invoice_id: string | null;
  nespracovany_id: string | null;
  kontrola_chyby?: number | null;
  kontrola_varovania?: number | null;
  /** `parsed_data->>documentKind` — samofaktúra sa medzi prijaté nezaraďuje. */
  druh?: string | null;
};

export type StavEfaktury =
  | "nova"
  | "zaevidovana"
  | "nespracovane"
  | "odmietnuta"
  | "necitatelna"
  | "archivovana"
  | "samofaktura";

const SAMOFAKTURY = ["self_billing", "self_billing_credit_note"];

/**
 * Stav pre zoznam v appke. Rovnaké pravidlá ako počítadlo na webe
 * (`cakaNaZaevidovanie`): nová je len tá, ktorú ešte nikto nevybavil.
 */
export function stavEfaktury(r: PrijataEfakturaApp): StavEfaktury {
  if (r.matched_supplier_invoice_id) return "zaevidovana";
  if (r.nespracovany_id) return "nespracovane";
  switch (r.status) {
    case "rejected":
      return "odmietnuta";
    case "parse_error":
      return "necitatelna";
    case "archived":
      return "archivovana";
    case "matched":
    case "accepted":
      return "zaevidovana";
  }
  if (r.druh && SAMOFAKTURY.includes(r.druh)) return "samofaktura";
  return "nova";
}

/** Ťuknutie „Zaevidovať“ má zmysel len pri novej eFaktúre. */
export function daSaZaevidovatVAppke(r: PrijataEfakturaApp): boolean {
  return stavEfaktury(r) === "nova";
}

export const NAZOV_STAVU: Record<StavEfaktury, Kluc> = {
  nova: "efp.stav.nova",
  zaevidovana: "efp.stav.zaevidovana",
  nespracovane: "efp.stav.nespracovane",
  odmietnuta: "efp.stav.odmietnuta",
  necitatelna: "efp.stav.necitatelna",
  archivovana: "efp.stav.archivovana",
  samofaktura: "efp.stav.samofaktura",
};

/** Farba štítku stavu: nová čaká (oranžová), vybavená zelená, zlá červená. */
export function tonStavu(s: StavEfaktury): "pozor" | "zelena" | "cervena" | "neutral" {
  if (s === "nova") return "pozor";
  if (s === "zaevidovana" || s === "nespracovane") return "zelena";
  if (s === "odmietnuta" || s === "necitatelna") return "cervena";
  return "neutral";
}

export type FilterEfaktur = "nove" | "vsetky";

export function filtrujEfaktury(
  riadky: PrijataEfakturaApp[],
  filter: FilterEfaktur,
): PrijataEfakturaApp[] {
  return filter === "nove" ? riadky.filter((r) => stavEfaktury(r) === "nova") : riadky;
}

/** Výsledok `zaevidujPrijatuEfakturuFn`. */
export type VysledokZaevidovaniaApp = {
  kam: "prijate" | "nespracovane";
  id: string;
  typ?: "regular" | "proforma";
  uzExistovala?: boolean;
  uzExistoval?: boolean;
  pripojena?: boolean;
};

/** Veta po zaevidovaní — tie isté prípady ako toast na webe. */
export function spravaPoZaevidovani(r: VysledokZaevidovaniaApp): Kluc {
  const doNespracovanych = r.kam === "nespracovane";
  if (r.pripojena) return doNespracovanych ? "efp.pripojenaNespracovane" : "efp.pripojenaPrijate";
  if (r.uzExistovala ?? r.uzExistoval) return "efp.uzZaevidovana";
  if (doNespracovanych) return "efp.odlozenaNespracovane";
  if (r.typ === "proforma") return "efp.zaevidovanaZalohova";
  return "efp.zaevidovana";
}

/**
 * Riadok po zaevidovaní — appka zoznam nemusí hneď znova ťahať, aby sa
 * štítok zmenil (a „Zaevidovať“ zmizlo) pod prstom.
 */
export function poZaevidovani(
  r: PrijataEfakturaApp,
  v: VysledokZaevidovaniaApp,
): PrijataEfakturaApp {
  return v.kam === "nespracovane"
    ? { ...r, nespracovany_id: v.id }
    : { ...r, matched_supplier_invoice_id: v.id };
}

/** Base64 → bajty (náhľad PDF prichádza zo servera ako base64). */
export function bajtyZBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
