/*
  Doklad o úhrade v Nespracovaných dokladoch.

  Pokladničný doklad „ÚHRADA FAKTÚRY — Faktúra č. 0/0/0002/052152 621,70 —
  KARTA 621,70“ (METRO, RHJ 11/2026) nie je daňový doklad: nemá rekapituláciu
  DPH, len potvrdzuje, že prijatá faktúra bola zaplatená (kartou, v hotovosti).
  Ako bloček by sa zaúčtoval druhýkrát a s vymyslenou sadzbou. Druh „Doklad
  o úhrade“ ho priradí k prijatej faktúre (súbor ide medzi jej prílohy)
  a nezaplatenú faktúru označí ako uhradenú dňom a spôsobom z dokladu.

  Čisté funkcie: rozpoznanie, údaje úhrady z vyťaženia, porovnanie čísel
  faktúr (METRO píše to isté číslo raz „0/0(022)0002/052152“, raz
  „0/0/0002/052152“, raz „Faktúrač.0/0/0002/052152“) a výber zhody.
*/
import type { UdajeNespracovaneho } from "./nespracovane";

type Ai = Record<string, unknown>;

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const s = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const cislo_ = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const NORMALIZUJ = (h: unknown): string =>
  String(h ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[._\-\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Text na preklad cez `t()` s parametrami. */
export type Dovod = { text: string; params?: Record<string, string | number> };

/** Údaje úhrady uložené pri nespracovanom doklade (`udaje.uhrada`). */
export type UdajeUhrady = {
  /** Číslo uhrádzanej faktúry, ako je na doklade. */
  cisloFaktury: string;
  /** Zaplatená suma. */
  suma: number | null;
  /** Deň úhrady (dátum dokladu), RRRR-MM-DD. */
  datum: string;
  /** karta / hotovost / prevod, prázdne = nevedno. */
  sposob: string;
};

/** Predpona chyby „suma nesedí“ — rozhranie sa podľa nej opýta a pošle `ajInuSumu`. */
export const PREDPONA_INEJ_SUMY = "INA_SUMA:";

/** Podtyp z AI pre doklad o úhrade faktúry. */
export const PODTYP_UHRADY = "uhrada_faktury";

/** Nadpis „Úhrada faktúry“, „Platba faktúry“, „Zaplatenie faktúry“ (po normalizácii). */
const UHRADA_SLOVA =
  /\b(uhrada|uhradenie|platba|zaplatenie|uhrazeni|zaplaceni|zahlung) (faktur|fa\b|dokladu|rechnung|der rechnung)/;
/** Riadok bločku, ktorý odkazuje na faktúru („Faktúra č.0/0/0002/052152“, „Úhrada FA 2026001“). */
const RIADOK_FAKTURY = /(\bfaktur\w*|\bfa\b|\binvoice\b|\brechnung\b)/;
/** UID dokladu z eKasy. */
const UID_EKASA = /\bO-[0-9A-F]{32}\b/i;

/**
 * Číslo faktúry v texte: „Faktúra č.0/0/0002/052152“, „Úhrada faktúry č. 2026001“,
 * „FA 2026-001“. Vráti prvé číslo, ktoré má aspoň jednu číslicu.
 */
export function cisloFakturyZTextu(text: unknown): string {
  const t = s(text);
  if (!t) return "";
  const vzor =
    /(?<![a-zA-Z])(?:fakt[uú]r[ay]?|faktura|fa|invoice|rechnung)\s*(?:č(?:íslo)?\.?|c\.|no\.?|nr\.?|#)?\s*[:.]?\s*([0-9A-Z]*\d[0-9A-Z\/\-.()]*[0-9A-Z)]|\d)/gi;
  for (const m of t.matchAll(vzor)) {
    const c = m[1]!.replace(/\.+$/, "");
    if (/\d/.test(c)) return c.slice(0, 60);
  }
  return "";
}

/** Je na doklade DPH? (rozpis s daňou alebo DPH v súčtoch) */
function maDph(ai: Ai): boolean {
  const rozpis = Array.isArray(ai.vat_breakdown) ? (ai.vat_breakdown as any[]) : [];
  if (rozpis.some((r) => Math.abs(cislo_(r?.vat) ?? 0) > 0.004)) return true;
  return Math.abs(cislo_(ai.vat_amount) ?? 0) > 0.004;
}

/** Riadky bločku s textom. */
function riadky(ai: Ai): string[] {
  return (Array.isArray(ai.items) ? (ai.items as any[]) : []).map((p) => s(p?.name)).filter(Boolean);
}

/**
 * Je doklad potvrdením o úhrade faktúry (nie bloček ani faktúra)?
 * - AI povedala `document_subtype: "uhrada_faktury"`,
 * - nadpis alebo názov súboru „Úhrada faktúry“, „Platba faktúry“, „Zaplatenie faktúry“,
 * - doklad z eKasy bez DPH, ktorého všetky riadky odkazujú na faktúru
 *   (alebo AI vrátila číslo uhrádzanej faktúry).
 */
export function jeDokladOUhrade(ai: Ai | null | undefined, nazovSuboru?: string | null): boolean {
  if (!ai) return false;
  if (s(ai.document_subtype).toLowerCase() === PODTYP_UHRADY) return true;
  const nadpis = NORMALIZUJ(ai.document_title);
  if (UHRADA_SLOVA.test(nadpis) || UHRADA_SLOVA.test(NORMALIZUJ(nazovSuboru))) return true;
  const ekasa =
    [ai.ekasa_uid, ai.invoice_number, ai.document_number].map(s).some((v) => UID_EKASA.test(v)) ||
    /^\d{17}$/.test(s(ai.cash_register_code).replace(/\s/g, ""));
  if (!ekasa || maDph(ai)) return false;
  if (s(ai.paid_invoice_number)) return true;
  const r = riadky(ai);
  return r.length > 0 && r.every((x) => RIADOK_FAKTURY.test(NORMALIZUJ(x)) && cisloFakturyZTextu(x) !== "");
}

/** Spôsob úhrady z textu dokladu. */
export function sposobUhrady(v: unknown): string {
  const k = NORMALIZUJ(v);
  if (!k) return "";
  if (/(karta|kartou|card|visa|mastercard|maestro)/.test(k)) return "karta";
  if (/(hotov|cash|bar\b)/.test(k)) return "hotovost";
  if (/(prevod|transfer|ucet)/.test(k)) return "prevod";
  return "";
}

/** Dátum v tvare RRRR-MM-DD z „2026-10-12“, „2026-10-12T14:03“ či „12.10.2026 14:03“. */
function den(v: unknown): string {
  const t = s(v);
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const sk = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (sk) return `${sk[3]}-${sk[2]!.padStart(2, "0")}-${sk[1]!.padStart(2, "0")}`;
  return "";
}

/** Údaje úhrady z vyťaženia AI. */
export function udajeUhradyZAi(ai: Ai | null | undefined): UdajeUhrady {
  const a = ai ?? {};
  const zRiadkov = riadky(a).map(cisloFakturyZTextu).find(Boolean) ?? "";
  const cisloAi = s(a.invoice_number);
  const cisloFaktury =
    s(a.paid_invoice_number) ||
    zRiadkov ||
    cisloFakturyZTextu(a.document_title) ||
    // Číslo dokladu z AI, len keď nie je UID z eKasy (to je číslo bločku, nie faktúry).
    (cisloAi && !UID_EKASA.test(cisloAi) && s(a.contains_invoice) === "true" ? cisloAi : "") ||
    cisloFakturyZTextu(a.summary) ||
    cisloFakturyZTextu(a.description);
  const suma = cislo_(a.paid_amount) ?? cislo_(a.amount_due) ?? cislo_(a.amount_total);
  return {
    cisloFaktury: cisloFaktury.slice(0, 60),
    suma: suma == null ? null : r2(Math.abs(suma)),
    datum: den(a.payment_date) || den(a.issue_date),
    sposob: sposobUhrady(a.payment_method),
  };
}

/**
 * Údaje nespracovaného dokladu pre druh „Doklad o úhrade“: bez rozpisu DPH,
 * položiek a kontrol sadzieb (nie je to daňový doklad), s údajmi úhrady.
 * Čo už človek v údajoch úhrady vyplnil, ostáva.
 */
export function udajePreUhradu(u: UdajeNespracovaneho, ai?: Ai | null): UdajeNespracovaneho {
  const z = udajeUhradyZAi(ai);
  const p = u.uhrada;
  const uhrada: UdajeUhrady = {
    cisloFaktury: s(p?.cisloFaktury) || z.cisloFaktury,
    suma: cislo_(p?.suma) ?? z.suma ?? (u.celkom != null ? r2(Math.abs(Number(u.celkom))) : null),
    datum: s(p?.datum) || z.datum || u.datumVystavenia || "",
    sposob: s(p?.sposob) || z.sposob || (u.platba === "karta" || u.platba === "hotovost" ? u.platba : ""),
  };
  return {
    ...u,
    rozpis: [],
    polozky: [],
    kontrolaDph: undefined,
    rozpisPotvrdeny: undefined,
    kontrolaRozpisu: undefined,
    prenesenie: undefined,
    zaokruhlenie: undefined,
    polozkyVypnute: undefined,
    uhrada,
  };
}

/* ───────────── Porovnanie čísel faktúr ───────────── */

/** Skupiny číslic čísla („0/0(022)0002/052152“ → 0, 0, 022, 0002, 052152). */
export function skupinyCislic(v: unknown): string[] {
  return s(v).match(/\d+/g) ?? [];
}

/** Číslo bez medzier, bodiek, lomiek a zátvoriek, veľkými písmenami, bez „Faktúra č.“. */
export function normalizujCisloFaktury(v: unknown): string {
  return s(v)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/^(FAKTURA|FA|INVOICE)\s*(C|NO|NR)?\.?\s*/, "")
    .replace(/[^0-9A-Z]/g, "");
}

/**
 * Kľúč čísla: posledné dve skupiny číslic spolu („0002052152“), pri čísle
 * s jednou skupinou celé číslo. Zhoda kľúča na konci druhého čísla znamená
 * tú istú faktúru, aj keď sa líši zápis predpony („0/0(022)“ vs „0/0/“).
 */
function kluc(v: unknown): string {
  const g = skupinyCislic(v);
  if (!g.length) return "";
  return g.length === 1 ? g[0]! : g.slice(-2).join("");
}

/**
 * Ako veľmi sa čísla zhodujú:
 * - 3 — rovnaké po normalizácii (bez medzier, bodiek, lomiek, zátvoriek),
 * - 2 — koniec číslic sa zhoduje (posledné dve skupiny, aspoň 6 číslic),
 *       alebo sa číslo zhoduje s variabilným symbolom,
 * - 1 — zhoduje sa len posledná skupina (aspoň 5 číslic) — slabé, len so sumou,
 * - 0 — nezhoduje sa.
 */
export function zhodaCisla(a: unknown, b: unknown, vsB?: unknown): 0 | 1 | 2 | 3 {
  const na = normalizujCisloFaktury(a);
  const nb = normalizujCisloFaktury(b);
  if (!na) return 0;
  if (nb && na === nb) return 3;
  const ca = skupinyCislic(a).join("");
  const cb = skupinyCislic(b).join("");
  const ka = kluc(a);
  const kb = kluc(b);
  if (ka.length >= 6 && kb.length >= 6 && (cb.endsWith(ka) || ca.endsWith(kb))) return 2;
  // Variabilný symbol faktúry (METRO: „5034734“ k číslu „0/0(021/0005/034734“).
  const vs = s(vsB).replace(/\D/g, "").replace(/^0+/, "");
  if (vs.length >= 6) {
    const bezNul = (x: string) => x.replace(/^0+/, "");
    if (bezNul(ka) === vs || bezNul(ca) === vs || bezNul(ca).endsWith(vs)) return 2;
  }
  const ga = skupinyCislic(a).at(-1) ?? "";
  const gb = skupinyCislic(b).at(-1) ?? "";
  if (ga.length >= 5 && ga === gb) return 1;
  return 0;
}

/** Najdlhšia skupina číslic — podľa nej sa faktúry hľadajú v databáze (`ilike`). */
export function hladanaCastCisla(v: unknown): string {
  const g = skupinyCislic(v).filter((x) => x.length >= 4);
  if (!g.length) return "";
  return g.reduce((a, b) => (b.length > a.length ? b : a));
}

/** Prijatá faktúra firmy na výber. */
export type KandidatPrijatej = {
  id: string;
  invoice_number: string | null;
  variable_symbol?: string | null;
  supplier_name?: string | null;
  issue_date?: string | null;
  amount_total?: number | string | null;
  currency?: string | null;
  status?: string | null;
  type?: string | null;
  payment_date?: string | null;
};

export type ZhodaPrijatej = {
  faktura: KandidatPrijatej;
  /** Sila zhody čísla (pozri `zhodaCisla`). */
  cislo: 0 | 1 | 2 | 3;
  /** Sedí suma? null = nedá sa povedať. */
  sumaSedi: boolean | null;
};

/** Sedí suma (na cent, bez ohľadu na znamienko)? null = nedá sa povedať. */
export function sumaSedi(a: number | null | undefined, b: unknown): boolean | null {
  const y = cislo_(b);
  if (a == null || !Number.isFinite(Number(a)) || y == null) return null;
  return Math.abs(Math.abs(Number(a)) - Math.abs(y)) < 0.015;
}

/**
 * Zhody prijatých faktúr s dokladom o úhrade, najlepšia prvá: silnejšia
 * zhoda čísla, potom sedí suma, potom nezaplatená. Slabá zhoda čísla
 * (len posledná skupina) sa berie len so sumou.
 */
export function zhodyPrijatych(
  kandidati: readonly KandidatPrijatej[],
  uhrada: Pick<UdajeUhrady, "cisloFaktury" | "suma">,
): ZhodaPrijatej[] {
  const out: ZhodaPrijatej[] = [];
  for (const f of kandidati) {
    const c = zhodaCisla(uhrada.cisloFaktury, f.invoice_number, f.variable_symbol);
    const sedi = sumaSedi(uhrada.suma, f.amount_total);
    if (c === 0 || (c === 1 && sedi !== true)) continue;
    out.push({ faktura: f, cislo: c, sumaSedi: sedi });
  }
  const body = (z: ZhodaPrijatej) =>
    z.cislo * 10 + (z.sumaSedi === true ? 5 : z.sumaSedi === false ? 0 : 2) + (z.faktura.status === "paid" ? 0 : 1);
  return out.sort((a, b) => body(b) - body(a));
}

/**
 * Presná zhoda pre hromadné priradenie: číslo (aspoň koniec číslic) a suma
 * sedia a žiadna iná faktúra s tým istým číslom a sumou nie je.
 */
export function presnaZhoda(zhody: readonly ZhodaPrijatej[]): ZhodaPrijatej | null {
  const dobre = zhody.filter((z) => z.cislo >= 2 && z.sumaSedi === true);
  if (!dobre.length) return null;
  // Dve faktúry s tým istým číslom aj sumou (napr. „.0/0/0002/052152“ aj „0/0(022)0002/052152“) — rozhodne človek.
  return dobre.length === 1 ? dobre[0]! : null;
}

/**
 * Hromadné „Priradiť doklady o úhrade“: len doklad o úhrade (druh alebo
 * návrh) so súborom a presnou zhodou. Ostatné sa preskočia s dôvodom.
 */
export function rozhodnutieUhrady(args: {
  druh: string | null | undefined;
  navrh: boolean;
  stav?: string | null;
  maSubor: boolean;
  uhrada: UdajeUhrady;
  zhody: readonly ZhodaPrijatej[];
}): { purchaseInvoiceId: string } | { dovod: Dovod } {
  if (args.stav === "cita") return { dovod: { text: "Doklad sa ešte číta" } };
  if (args.druh !== "uhrada" && !args.navrh)
    return { dovod: { text: "Nie je doklad o úhrade — v detaile určte druh Doklad o úhrade" } };
  if (!args.maSubor) return { dovod: { text: "Doklad nemá súbor, ktorý by sa dal priložiť" } };
  if (!args.uhrada.cisloFaktury) return { dovod: { text: "Na doklade nie je číslo uhrádzanej faktúry" } };
  const z = presnaZhoda(args.zhody);
  if (z) return { purchaseInvoiceId: z.faktura.id };
  if (!args.zhody.length)
    return {
      dovod: {
        text: "Faktúra {cislo} ešte nie je vo Fakteri — otvorte doklad a vytvorte ju",
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

/** Text súhrnu hromadného priradenia. */
export function textPriradeniaUhrad(priradene: number, preskocene: number): Dovod {
  if (!priradene && !preskocene) return { text: "Nebolo čo priradiť" };
  if (!preskocene) return { text: "Priradené doklady o úhrade: {n}", params: { n: priradene } };
  return { text: "Priradené {ok}, preskočené {n}", params: { ok: priradene, n: preskocene } };
}

/**
 * Čo sa stane s faktúrou pri priradení: označí sa ako uhradená (suma
 * a dátum úhrady), alebo len dostane prílohu (s dôvodom, prečo nie úhradu).
 */
export function planUhrady(args: {
  status: string | null | undefined;
  type: string | null | undefined;
  /** Koľko ešte zostáva uhradiť (`stavUhradyPrijatej`). */
  zostava: number;
  uhrada: Pick<UdajeUhrady, "suma" | "datum">;
  dnes: string;
}): { uhradit: { suma: number; datum: string } } | { lenPriloha: Dovod } {
  if (args.status === "cancelled") return { lenPriloha: { text: "Faktúra je stornovaná — úhrada sa nezapísala." } };
  if (args.status === "draft") return { lenPriloha: { text: "Faktúra je koncept — úhrada sa nezapísala." } };
  if (args.type === "advance_payment")
    return { lenPriloha: { text: "Daňový doklad k platbe sa neuhrádza — úhrada sa nezapísala." } };
  if (args.status === "paid" || !(args.zostava > 0.004))
    return { lenPriloha: { text: "Faktúra už je uhradená — doklad sa len priložil." } };
  const suma = args.uhrada.suma != null && args.uhrada.suma > 0 ? r2(args.uhrada.suma) : r2(args.zostava);
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(args.uhrada.datum) ? args.uhrada.datum : args.dnes;
  return { uhradit: { suma, datum } };
}

export const NECITATELNA_FAKTURA =
  "Súbor obsahuje len doklad o úhrade, nie samotnú faktúru (s rozpisom DPH) — faktúru najprv nahrajte alebo zapíšte do Prijatých faktúr a doklad o úhrade potom priraďte.";

/**
 * Dá sa z dokladu založiť aj prijatá faktúra? Len keď súbor nesie samotnú
 * faktúru: AI nepovedala, že faktúra v súbore nie je, a vrátila rozpis DPH
 * z dokladu (nie len sadzby položiek bločku), dodávateľa a dátum vystavenia.
 * `udajeFaktury` sú údaje z toho istého vyťaženia ako pri prijatej faktúre.
 */
export function fakturaZDokladuUhrady(args: {
  ai: Ai | null | undefined;
  udajeFaktury: UdajeNespracovaneho;
  uhrada: UdajeUhrady;
}): { ok: true; udaje: UdajeNespracovaneho } | { ok: false; dovod: string } {
  const ai = args.ai ?? {};
  if (ai.contains_invoice === false || s(ai.contains_invoice) === "false") return { ok: false, dovod: NECITATELNA_FAKTURA };
  const rozpisZDokladu = Array.isArray(ai.vat_breakdown) && (ai.vat_breakdown as unknown[]).length > 0;
  const u = { ...args.udajeFaktury, dodavatel: { ...args.udajeFaktury.dodavatel } };
  if (!rozpisZDokladu || !u.rozpis.length) return { ok: false, dovod: NECITATELNA_FAKTURA };
  if (!u.dodavatel.nazov.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(u.datumVystavenia))
    return { ok: false, dovod: NECITATELNA_FAKTURA };
  // Číslo faktúry: z faktúry, keď to nie je UID bločku; inak číslo uhrádzanej faktúry.
  if (!u.cislo.trim() || UID_EKASA.test(u.cislo)) u.cislo = args.uhrada.cisloFaktury;
  if (!u.cislo.trim()) return { ok: false, dovod: NECITATELNA_FAKTURA };
  if (args.uhrada.cisloFaktury && zhodaCisla(args.uhrada.cisloFaktury, u.cislo) === 0)
    return {
      ok: false,
      dovod: `Faktúra v súbore má číslo ${u.cislo}, doklad o úhrade platí faktúru ${args.uhrada.cisloFaktury} — vytvorte faktúru ručne.`,
    };
  // Zaplatená pri pokladnici — splatnosť je deň vystavenia, ak ju faktúra neuvádza.
  if (!u.splatnost) u.splatnost = u.datumVystavenia;
  if (u.splatnost < u.datumVystavenia) u.splatnost = u.datumVystavenia;
  if (args.uhrada.sposob) u.platba = args.uhrada.sposob;
  u.uhrada = undefined;
  return { ok: true, udaje: u };
}
