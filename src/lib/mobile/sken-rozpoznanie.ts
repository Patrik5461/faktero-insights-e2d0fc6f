/*
  Jeden skener na všetko — čistá logika obrazovky rozpoznaného dokladu.

  Appka doklad nahrá do Nespracovaných dokladov, server ho prečíta a povie,
  čo to je (bloček, prijatá faktúra, zálohová, dobropis, iný doklad). Tu je
  to, čo appka s výsledkom robí sama: doplní do údajov nastavenie zo skenera
  (úhrada, kategória, zákazka…), vyberie polia, ktoré treba ešte doplniť, a
  pozná QR kód bločku, ktorý ide ďalej starou cestou cez Finančnú správu.

  Bez siete a bez Reactu, aby sa to dalo otestovať.
*/

import {
  chybajuce,
  NAZVY_POLI,
  type DruhNespracovaneho,
  type UdajeNespracovaneho,
} from "@/lib/faktero/nespracovane";
import { isEkasaQr } from "@/lib/faktero/ekasa";
import { jeEetQr } from "@/lib/faktero/eet-cz";

/**
 * Nastavenie dokladu zo skenera. Štruktúrne rovnaké ako `NastavenieDokladu`
 * v `Skener.tsx` — knižnica si komponent neťahá.
 */
export type NastavenieSkenu = {
  uhrada?: string;
  kategoria?: string;
  zakazka?: string;
  predkontacia?: string;
  poznamka?: string;
};

/**
 * Doplní do vyťažených údajov to, čo si človek nastavil na skeneri.
 *
 * Prečítané z dokladu sa neprepisuje — nastavenie platí len tam, kde doklad
 * nič nepovedal. Výnimkou je komentár: ten človek napísal výslovne k tomuto
 * dokladu, kým zhrnutie od AI je len pomôcka.
 *
 * Úhrada patrí len bločku. Na skeneri je predvolená karta a prijatá faktúra
 * zaplatená „kartou" by v príkaze na úhradu chýbala.
 */
export function doplnZNastavenia(
  u: UdajeNespracovaneho,
  druh: DruhNespracovaneho,
  n?: NastavenieSkenu | null,
): UdajeNespracovaneho {
  if (!n) return u;
  const out: UdajeNespracovaneho = { ...u, kody: { ...u.kody } };
  const poznamka = n.poznamka?.trim();
  if (poznamka) out.poznamka = poznamka;
  if (druh === "ostatny") return out;
  if (druh === "blocek" && !out.platba && n.uhrada) out.platba = n.uhrada;
  if (!out.kategoria && n.kategoria) out.kategoria = n.kategoria;
  if (!out.jobId && n.zakazka) out.jobId = n.zakazka;
  if (!out.kody.predkontacia && n.predkontacia) out.kody.predkontacia = n.predkontacia;
  return out;
}

/** Pole, ktoré sa dá doplniť priamo v appke. */
export type PoleNaDoplnenie =
  "dodavatel" | "cislo" | "datumVystavenia" | "splatnost" | "opravuje" | "celkom";

export const TYP_POLA: Record<PoleNaDoplnenie, "text" | "date" | "number"> = {
  dodavatel: "text",
  cislo: "text",
  datumVystavenia: "date",
  splatnost: "date",
  opravuje: "text",
  celkom: "number",
};

/**
 * Čo treba pred uložením doplniť.
 *
 * Počíta sa z údajov **pred** úpravami človeka: keby sa počítalo z
 * upravených, políčko by zmizlo spod prstov hneď po prvom napísanom znaku.
 *
 * - `upravitelne` — polia, ktoré appka ukáže na doplnenie,
 * - `vyrovnat` — položky nesedia so sumou; appka ponúkne vyrovnávaciu položku
 *   ako web,
 * - `mimoAppky` — povinné polia firmy (stredisko, činnosť, zákazka), na ktoré
 *   appka výber nemá; doklad sa vtedy dokončí na webe.
 *
 * Spôsob úhrady sem nepatrí — pri bločku ho obrazovka ukazuje vždy.
 */
export function polaNaDoplnenie(
  druh: DruhNespracovaneho,
  u: UdajeNespracovaneho,
  povinne: string[] = [],
): { upravitelne: PoleNaDoplnenie[]; vyrovnat: boolean; mimoAppky: string[] } {
  const upravitelne: PoleNaDoplnenie[] = [];
  const mimoAppky: string[] = [];
  let vyrovnat = false;
  const pridaj = (p: PoleNaDoplnenie) => {
    if (!upravitelne.includes(p)) upravitelne.push(p);
  };
  for (const k of chybajuce(druh, u, povinne)) {
    if (k === "druh" || k === "platba") continue;
    if (k === "polozky") vyrovnat = true;
    // Splatnosť pred vystavením je preklep v jednom z dátumov — ukážu sa oba.
    else if (k === "splatnostPred") {
      pridaj("datumVystavenia");
      pridaj("splatnost");
    } else if (k in TYP_POLA) pridaj(k as PoleNaDoplnenie);
    else mimoAppky.push(NAZVY_POLI[k] ?? k);
  }
  return { upravitelne, vyrovnat, mimoAppky };
}

/** Hodnota poľa v údajoch — predvyplní políčko na doplnenie. */
export function hodnotaPola(u: UdajeNespracovaneho, p: PoleNaDoplnenie): string {
  if (p === "dodavatel") return u.dodavatel.nazov;
  if (p === "celkom") return u.celkom == null ? "" : String(u.celkom);
  return u[p] ?? "";
}

/** Suma napísaná človekom — prijme aj desatinnú čiarku a medzery. */
export function citajSumu(v: string): number | null {
  const s = v.replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

/** Úpravy človeka zapísané do údajov. */
export function uplatniUpravy(
  u: UdajeNespracovaneho,
  upravy: Partial<Record<PoleNaDoplnenie, string>>,
): UdajeNespracovaneho {
  const out: UdajeNespracovaneho = { ...u, dodavatel: { ...u.dodavatel } };
  for (const [k, v] of Object.entries(upravy) as [PoleNaDoplnenie, string | undefined][]) {
    if (v === undefined) continue;
    if (k === "dodavatel") out.dodavatel.nazov = v;
    else if (k === "celkom") out.celkom = citajSumu(v);
    else out[k] = v.trim();
  }
  return out;
}

/**
 * QR kód, ktorý nesie bloček — slovenská eKasa alebo český EET.
 *
 * Takýto kód sa číta ďalej po starom (Finančná správa, offline fronta). Na
 * fotke faktúry býva iný QR — platobný PAY by square alebo český SPD — a ten
 * z faktúry bloček nerobí; doklad ide do rozpoznania ako každý iný.
 */
export function jeBlockovyQr(qr: string | null | undefined): boolean {
  const t = String(qr ?? "").trim();
  if (!t) return false;
  if (jeEetQr(t)) return true;
  // PAY by square je base32hex (0–9, A–V), SPD začína hlavičkou „SPD*".
  if (/^SPD\*/i.test(t) || /^[0-9A-V]{40,}$/.test(t)) return false;
  return isEkasaQr(t);
}

/** Dokedy sa oplatí čakať na prečítanie, kým appka ponúkne odchod. */
export const STROP_CITANIA_MS = 90_000;
export const INTERVAL_CITANIA_MS = 2_000;
