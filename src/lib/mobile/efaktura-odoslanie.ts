/**
 * Odoslanie eFaktúry z appky — rozhodnutie, čo obrazovka ukáže.
 *
 * Pravidlá sú tie isté ako na webe: zálohová faktúra nie je daňový doklad
 * (`druhZFaktury`), koncept odberateľ ešte nemá, stornovaná sa neposiela,
 * firma musí mať eFaktúru aktivovanú (`jeEfakturaAktivovana`) a faktúra musí
 * prejsť kontrolou pred odoslaním (`nacitajAKontrolujFakturu`). Server všetko
 * overí znova pri odoslaní — tu ide len o to, aby človek vedel prečo skôr,
 * než ťukne.
 *
 * Čisté funkcie bez Reactu, nech sa dajú otestovať.
 */
import type { Kluc } from "./preklady";

export type FakturaNaEfakturu = { status: string; type: string };

/** Čo vráti `efaktura-priprav` (pozri `mobil-odoslanie.functions.ts`). */
export type PripravaEfaktury = {
  aktivovana: boolean;
  testovaci: boolean;
  dorucenie: { status: string; sent_at: string | null; delivered_at: string | null } | null;
  /** `null` = kontrola sa nerobila (eFaktúra nie je aktivovaná). */
  kontrola: KontrolaAppky | { nedaSa: string } | null;
};

/** Nález kontroly pred odoslaním — kód pravidla a popis z webu (po slovensky). */
export type NalezAppky = { kod: string; text: string };

export type KontrolaAppky = {
  mozno: boolean;
  chyby: NalezAppky[];
  varovania: NalezAppky[];
};

/**
 * Prečo sa faktúra eFaktúrou neposiela už podľa toho, čo appka o nej vie
 * (bez servera). `null` = tlačidlo sa ponúkne. `skryt` = netreba ani písať prečo.
 */
export function dovodBezServera(f: FakturaNaEfakturu): { kluc: Kluc; skryt?: boolean } | null {
  if (f.status === "cancelled") return { kluc: "efo.posli.stornovana", skryt: true };
  if (f.type === "proforma") return { kluc: "efo.posli.zalohova" };
  if (f.status === "draft") return { kluc: "efo.posli.koncept" };
  return null;
}

/** Neúspešné doručenie sa smie poslať znova bez varovania — ako na webe. */
const NEUSPESNE = ["failed", "error", "rejected"];

export function jeOdoslana(d: PripravaEfaktury["dorucenie"]): boolean {
  return !!d && !NEUSPESNE.includes(String(d.status));
}

export type StavOdoslania =
  /** Firma nemá aktivovanú eFaktúru — aktivuje sa na webe. */
  | { druh: "neaktivna" }
  /** Doklad sa eFaktúrou poslať nedá (odberateľ bez DIČ, zálohová…). Text zo servera. */
  | { druh: "nedaSa"; dovod: string }
  /** Kontrola našla chyby — odoslanie je zablokované. */
  | { druh: "chyby"; kontrola: KontrolaAppky }
  /** Dá sa odoslať (prípadne s varovaniami, prípadne znova). */
  | { druh: "mozno"; kontrola: KontrolaAppky | null; znova: boolean };

export function vyhodnotPripravu(p: PripravaEfaktury): StavOdoslania {
  if (!p.aktivovana) return { druh: "neaktivna" };
  const znova = jeOdoslana(p.dorucenie);
  if (!p.kontrola) return { druh: "mozno", kontrola: null, znova };
  if ("nedaSa" in p.kontrola) return { druh: "nedaSa", dovod: p.kontrola.nedaSa };
  if (!p.kontrola.mozno) return { druh: "chyby", kontrola: p.kontrola };
  return { druh: "mozno", kontrola: p.kontrola, znova };
}

/** Stav doručenia z odpovede ePoštáka ako kľúč prekladu (rovnaké mapovanie ako server). */
export function klucStavu(s: unknown): Kluc | null {
  const v = String(s ?? "").toLowerCase();
  if (["delivered", "received"].includes(v)) return "efo.posli.stav.dorucena";
  if (["accepted", "ok"].includes(v)) return "efo.posli.stav.prijata";
  if (["sent", "in_transit", "processing"].includes(v)) return "efo.posli.stav.odoslana";
  if (["failed", "error"].includes(v)) return "efo.posli.stav.zlyhala";
  if (["rejected", "denied"].includes(v)) return "efo.posli.stav.odmietnuta";
  if (["pending", "queued", "accepted_for_processing"].includes(v)) return "efo.posli.stav.caka";
  return null;
}

/** Adresa nastavenia eFaktúry na webe — tá istá ako v ozname o e-fakturácii. */
export const CESTA_AKTIVACIE = "/efaktura#prepojenie";
