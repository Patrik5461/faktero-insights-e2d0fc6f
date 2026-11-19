/**
 * Prijaté dobropisy — karta „Prijaté“ na stránke Dobropisy (`/faktury?type=credit`).
 *
 * Prijatý dobropis nemá v `purchase_invoices` vlastný `type` (je `regular`).
 * Pozná sa rovnako ako v `typPrijatej` (pravidlá, členenie, autopilot):
 * nie je zálohová ani daňový doklad k platbe a má zápornú sumu alebo
 * vyplnené „Opravuje číslo“. Je to len pohľad — doklad ostáva aj medzi
 * Prijatými faktúrami.
 */
import { typPrijatej } from "./pravidla-uctovania";
import { sumaNaZobrazenie } from "./dobropis-zobrazenie";

export type SmerDobropisov = "vydane" | "prijate";

/** Karta z adresy (`?smer=prijate`); čokoľvek iné je Vydané. */
export function smerDobropisov(v: unknown): "prijate" | undefined {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s === "prijate" || s === "prijaté" ? "prijate" : undefined;
}

export type RiadokPrijatehoDobropisu = {
  type?: string | null;
  amount_total?: number | string | null;
  opravuje_cislo?: string | null;
};

/** Je riadok `purchase_invoices` prijatý dobropis? */
export function jePrijatyDobropis(r: RiadokPrijatehoDobropisu | null | undefined): boolean {
  if (!r) return false;
  return typPrijatej(r.type, r.amount_total, r.opravuje_cislo) === "credit_note";
}

/**
 * Podmienka pre PostgREST (`.or(...)`) — tá istá ako `jePrijatyDobropis`
 * (typ sa vylúči zvlášť cez `.not("type", "in", "(proforma,advance_payment)")`).
 */
export const OR_PRIJATY_DOBROPIS =
  "amount_total.lt.0,and(opravuje_cislo.not.is.null,opravuje_cislo.neq.)";
export const TYPY_MIMO_DOBROPISU = "(proforma,advance_payment)";

/** Suma na zobrazenie — dobropis kladne, ako vydané dobropisy (DB ostáva záporná). */
export function sumaPrijatehoDobropisu(r: RiadokPrijatehoDobropisu): number {
  return sumaNaZobrazenie({ type: "credit_note", total: r.amount_total }, r.amount_total);
}

/** Hľadanie v načítaných riadkoch — číslo, dodávateľ, IČO, opravované číslo. */
export function hladajPrijateDobropisy<
  T extends {
    invoice_number?: string | null;
    supplier_name?: string | null;
    supplier_ico?: string | null;
    opravuje_cislo?: string | null;
  },
>(riadky: T[], q: string): T[] {
  const h = q.trim().toLowerCase();
  if (!h) return riadky;
  return riadky.filter((r) =>
    [r.invoice_number, r.supplier_name, r.supplier_ico, r.opravuje_cislo].some((x) =>
      String(x ?? "").toLowerCase().includes(h),
    ),
  );
}
