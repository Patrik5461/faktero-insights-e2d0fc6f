/*
  Bloček, ktorý je v skutočnosti úhradou faktúry.

  METRO pri platbe faktúry kartou vydá z eKasy doklad „ÚHRADA FAKTÚRY —
  Faktúra č. 0/0/0002/052152 621,70 — KARTA 621,70“. Keď ho niekto nahrá
  medzi Bločky, zaúčtoval by sa ako nákup (druhýkrát, s vymyslenou DPH).
  Z bločku sa preto dá urobiť doklad o úhrade prijatej faktúry (súbor ide
  medzi jej prílohy, faktúra sa označí ako uhradená) alebo Iný doklad.

  Čisté funkcie: rozpoznanie na riadku `expense_documents` (vyťaženie AI
  v `ai_raw`, riadky v `items`, UID z eKasy v `qr_raw`), údaje úhrady,
  rozhodnutie hromadného priradenia, zámok a údaje Iného dokladu.
  Porovnanie čísel a výber faktúry sú spoločné s Nespracovanými
  (`nespracovane-uhrada.ts`).
*/
import {
  cisloFakturyZTextu,
  jeDokladOUhrade,
  presnaZhoda,
  sposobUhrady,
  udajeUhradyZAi,
  type Dovod,
  type UdajeUhrady,
  type ZhodaPrijatej,
} from "./nespracovane-uhrada";
import { dovodZamku, NAZOV_ZAMKU } from "./doklady-hromadne";

type Ai = Record<string, unknown>;

/** Stĺpce bločku, z ktorých sa úhrada rozpoznáva (všetky existujú v `expense_documents`). */
export type RiadokBlocku = {
  id?: string;
  company_id?: string;
  status?: string | null;
  supplier_name?: string | null;
  document_number?: string | null;
  issue_date?: string | null;
  total_amount?: number | string | null;
  vat_amount?: number | string | null;
  vat_breakdown?: unknown;
  currency?: string | null;
  payment_method?: string | null;
  items?: unknown;
  ai_raw?: unknown;
  qr_raw?: string | null;
  note?: string | null;
  file_path?: string | null;
  file_mime?: string | null;
  exported_at?: string | null;
  locked_at?: string | null;
};

const s = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const cislo_ = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const UID_EKASA = /\bO-[0-9A-F]{32}\b/i;
const NORM = (v: unknown) =>
  s(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
/** Riadok odkazuje na faktúru („Faktúra č.0/0/0002/052152“, „Úhrada FA 2026001“). */
const RIADOK_FAKTURY = /(\bfaktur\w*|\bfa\b|\binvoice\b|\brechnung\b)/;

function polozky(r: RiadokBlocku): any[] {
  const ai = (r.ai_raw && typeof r.ai_raw === "object" ? r.ai_raw : {}) as Ai;
  if (Array.isArray(ai.items) && ai.items.length) return ai.items as any[];
  return Array.isArray(r.items) ? (r.items as any[]) : [];
}

/**
 * Vyťaženie bločku v tvare, ktorý pozná rozpoznanie z Nespracovaných: `ai_raw`
 * doplnené o riadky z `items` a UID z eKasy z `qr_raw` (bloček z QR nemá AI).
 */
export function aiBlocku(r: RiadokBlocku): Ai {
  const ai = { ...((r.ai_raw && typeof r.ai_raw === "object" ? r.ai_raw : {}) as Ai) };
  ai.items = polozky(r);
  if (!s(ai.ekasa_uid) && UID_EKASA.test(s(r.qr_raw))) ai.ekasa_uid = s(r.qr_raw).match(UID_EKASA)![0];
  // DPH platí uložená na bločku (človek ju mohol opraviť), nie len prečítaná AI.
  if (cislo_(r.vat_amount) != null) ai.vat_amount = cislo_(r.vat_amount);
  if (Array.isArray(r.vat_breakdown) && r.vat_breakdown.length)
    ai.vat_breakdown = (r.vat_breakdown as any[]).map((x) => ({ ...x, vat: x?.vat ?? x?.dph }));
  return ai;
}

/** Má bloček DPH? Uložená suma DPH, rozpis bločku (`dph`) alebo rozpis z AI (`vat`). */
function maDphBlocku(r: RiadokBlocku): boolean {
  if (Math.abs(cislo_(r.vat_amount) ?? 0) > 0.004) return true;
  const rozpis = Array.isArray(r.vat_breakdown) ? (r.vat_breakdown as any[]) : [];
  return rozpis.some((x) => Math.abs(cislo_(x?.dph ?? x?.vat) ?? 0) > 0.004);
}

/**
 * Vyzerá bloček ako úhrada faktúry?
 * - signály z Nespracovaných (`document_subtype`, nadpis „Úhrada faktúry“,
 *   eKasa bez DPH s riadkami „Faktúra č. …“),
 * - alebo bloček bez DPH, ktorého všetky riadky sú „Faktúra č. …“ s číslom
 *   (odfotený bloček z eKasy nemusí mať UID prečítané).
 */
export function jeBlocekUhradou(r: RiadokBlocku | null | undefined): boolean {
  if (!r) return false;
  const ai = aiBlocku(r);
  if (jeDokladOUhrade(ai, r.file_path ? String(r.file_path).split("/").pop() : null)) return true;
  if (maDphBlocku(r)) return false;
  const nazvy = polozky(r)
    .map((p) => s(p?.name))
    .filter(Boolean);
  return nazvy.length > 0 && nazvy.every((x) => RIADOK_FAKTURY.test(NORM(x)) && cisloFakturyZTextu(x) !== "");
}

/**
 * Údaje úhrady z bločku: číslo faktúry z riadkov / nadpisu / AI (číslo bločku
 * len ako posledná možnosť a nikdy UID z eKasy), suma = suma bločku, deň =
 * dátum bločku, spôsob z bločku.
 */
export function udajeUhradyBlocku(r: RiadokBlocku): UdajeUhrady {
  const z = udajeUhradyZAi(aiBlocku(r));
  const cisloBlocku = s(r.document_number);
  const cisloFaktury =
    z.cisloFaktury ||
    cisloFakturyZTextu(r.note) ||
    (cisloBlocku && !UID_EKASA.test(cisloBlocku) ? cisloFakturyZTextu(cisloBlocku) || cisloBlocku : "");
  const suma = cislo_(r.total_amount);
  const datum = /^\d{4}-\d{2}-\d{2}/.test(s(r.issue_date)) ? s(r.issue_date).slice(0, 10) : z.datum;
  return {
    cisloFaktury: cisloFaktury.slice(0, 60),
    suma: suma != null ? r2(Math.abs(suma)) : z.suma,
    datum,
    sposob: sposobUhrady(r.payment_method) || z.sposob,
  };
}

/** Prečo sa bloček nedá presunúť ani priradiť (odovzdaný, zamknutý, uzavreté obdobie), alebo null. */
export function zamokBlocku(r: RiadokBlocku, zamknuteDo: string | null | undefined): Dovod | null {
  const z = dovodZamku(r, zamknuteDo);
  return z ? { text: NAZOV_ZAMKU[z] } : null;
}

/** Popis bločku v súhrne hromadnej akcie. */
export function popisBlocku(r: RiadokBlocku, uhrada?: UdajeUhrady): string {
  return (
    [r.supplier_name, uhrada?.cisloFaktury || r.document_number].filter((v) => v && String(v).trim()).join(" · ") ||
    "Bloček"
  );
}

/**
 * Hromadné „Priradiť úhrady k faktúram“: len bloček, ktorý vyzerá ako úhrada,
 * nie je zamknutý, má súbor a presnú jedinečnú zhodu (číslo aspoň koniec
 * číslic + suma). Ostatné sa preskočia s dôvodom.
 */
export function rozhodnutieBlocku(args: {
  r: RiadokBlocku;
  zamok: Dovod | null;
  uhrada: UdajeUhrady;
  zhody: readonly ZhodaPrijatej[];
}): { purchaseInvoiceId: string } | { dovod: Dovod } {
  if (args.zamok) return { dovod: args.zamok };
  if (!jeBlocekUhradou(args.r))
    return { dovod: { text: "Nevyzerá ako úhrada faktúry — priraďte ho v detaile bločku" } };
  if (!args.r.file_path) return { dovod: { text: "Bloček nemá súbor, ktorý by sa dal priložiť" } };
  if (!args.uhrada.cisloFaktury) return { dovod: { text: "Na doklade nie je číslo uhrádzanej faktúry" } };
  const z = presnaZhoda(args.zhody);
  if (z) return { purchaseInvoiceId: z.faktura.id };
  if (!args.zhody.length)
    return {
      dovod: {
        text: "Faktúra {cislo} ešte nie je vo Fakteri — najprv ju zapíšte do Prijatých faktúr",
        params: { cislo: args.uhrada.cisloFaktury },
      },
    };
  return {
    dovod: {
      text: "Faktúra {cislo} sa nedá priradiť naisto (iná suma alebo viac faktúr) — rozhodnite v detaile",
      params: { cislo: args.uhrada.cisloFaktury },
    },
  };
}

/** Poznámka pri úhrade zapísanej z bločku. */
export const POZNAMKA_UHRADY_Z_BLOCKU = "Doklad o úhrade z Bločkov";

/**
 * Iný doklad z bločku: odosielateľ = dodávateľ, predmet podľa toho, či je to
 * úhrada faktúry, dátum a suma z bločku. Bloček je zaplatený na mieste —
 * Iný doklad je hneď uhradený dňom bločku. Stav ostáva (spracovaný ostáva
 * spracovaný).
 */
export function ostatnyZBlocku(r: RiadokBlocku, dnes: string) {
  const uhrada = jeBlocekUhradou(r);
  const u = udajeUhradyBlocku(r);
  const datum = /^\d{4}-\d{2}-\d{2}/.test(s(r.issue_date)) ? s(r.issue_date).slice(0, 10) : dnes;
  const predmet = uhrada
    ? u.cisloFaktury
      ? `Úhrada faktúry č. ${u.cisloFaktury}`
      : "Úhrada faktúry"
    : s(r.document_number)
      ? `Bloček ${s(r.document_number)}`
      : "Bloček";
  const poznamka = [uhrada ? "Presunuté z Bločkov (úhrada faktúry)" : "Presunuté z Bločkov", s(r.note)]
    .filter(Boolean)
    .join("\n");
  const suma = cislo_(r.total_amount);
  return {
    kind: "ine" as const,
    sender: s(r.supplier_name) || null,
    subject: predmet.slice(0, 500),
    received_date: datum,
    amount: suma == null ? null : r2(suma),
    currency: (s(r.currency) || "EUR").toUpperCase().slice(0, 3),
    note: poznamka.slice(0, 5000),
    paid_at: datum,
    status: r.status === "processed" ? ("processed" as const) : ("new" as const),
  };
}

/** Text súhrnu hromadnej akcie. */
export function textSuhrnuBlockov(hotovo: number, preskocene: number, co: "priradenie" | "presun"): Dovod {
  if (!hotovo && !preskocene) return { text: "Nebolo čo spracovať" };
  if (co === "priradenie") {
    if (!preskocene) return { text: "Priradené k faktúram: {n}", params: { n: hotovo } };
    return { text: "Priradené {ok}, preskočené {n}", params: { ok: hotovo, n: preskocene } };
  }
  if (!preskocene) return { text: "Presunuté do Iných dokladov: {n}", params: { n: hotovo } };
  return { text: "Presunuté {ok}, preskočené {n}", params: { ok: hotovo, n: preskocene } };
}
