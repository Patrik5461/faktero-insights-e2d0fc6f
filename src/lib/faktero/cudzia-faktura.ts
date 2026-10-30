/*
  Prijatá faktúra, ktorá nepatrí firme — odberateľ na doklade je iná firma.

  Stáva sa to pri preposlanom maile, pri účtovníkovi s viacerými klientmi
  alebo pri dodávateľovi, ktorý pošle faktúru na zlú adresu. Zaúčtovaná by
  bola cudzí náklad a cudzí odpočet DPH. Kontrola beží na serveri pri vzniku
  faktúry (Nespracované → Vytvoriť, eFaktúra, import, API) a výsledok sa
  uloží do `purchase_invoices.odberatel_nesedi`. Kým príznak trvá, faktúra sa
  nezaúčtuje (ručne, hromadne, pravidlom ani automatom), nejde do exportu ani
  do príkazu na úhradu. Zruší ho len potvrdenie „Faktúra patrí tejto firme“.

  Rozpoznanie je zámerne opatrné — zlé zablokovanie by ľudí naučilo príznak
  odklikávať:
  - Rozhodujú IČO, DIČ a IČ DPH. Stačí jedna zhoda a faktúra patrí firme
    (AI občas prečíta jedno číslo zle). Nepatrí, keď sa dá aspoň jedno číslo
    porovnať a žiadne nesedí.
  - Názov rozhoduje len vtedy, keď sa žiadne číslo porovnať nedá, a len keď
    sa názvy nezhodujú ani v jednom slove.
  - Bez údajov odberateľa nevieme nič a nič sa neblokuje.
  - Keď je firma na doklade dodávateľom, je to jej vystavená faktúra — to
    rieši upozornenie podľa IBAN-u, nie táto kontrola.
*/

import { normalizujNazov } from "./mail-rozdelovac";

export type Strana = {
  nazov?: string | null;
  ico?: string | null;
  dic?: string | null;
  icDph?: string | null;
};

/** Čo sa uloží na doklad (stĺpec `odberatel_nesedi`). */
export type OdberatelNesedi = {
  /** Podľa čoho sa nezhoda zistila. */
  dovod: "ico" | "dic" | "ic_dph" | "nazov";
  odberatel: {
    nazov: string | null;
    ico: string | null;
    dic: string | null;
    ic_dph: string | null;
  };
  /** Názov firmy, v ktorej doklad je (do textu upozornenia). */
  firma: { nazov: string | null };
  zistene_at?: string;
};

const cisteIco = (v: unknown) => {
  const c = String(v ?? "").replace(/\D/g, "");
  // Slovenské a české IČO má 8 číslic — vedúce nuly AI občas zahodí.
  return c && c.length <= 8 ? c.padStart(8, "0") : c;
};
const cisteKod = (v: unknown) =>
  String(v ?? "")
    .replace(/[\s.\-/]/g, "")
    .toUpperCase();
/** DIČ ako číslice — „SK2020123456“, „2020123456“ aj „CZ12345678“. */
const cisteDic = (v: unknown) =>
  cisteKod(v)
    .replace(/^[A-Z]{2}/, "")
    .replace(/\D/g, "");

/** IČ DPH, z ktorého sa dá vyčítať DIČ (SK a CZ ho majú v sebe). */
function dicZIcDph(icDph: string): string {
  return /^(SK|CZ)\d{8,10}$/.test(icDph) ? icDph.slice(2) : "";
}

type Cisla = { ico: string; dic: string; icDph: string };

function cisla(s: Strana | null | undefined): Cisla {
  const icDph = cisteKod(s?.icDph);
  // IČ DPH musí začínať kódom štátu, inak je to skôr zle prečítané DIČ.
  const platneIcDph = /^[A-Z]{2}[0-9A-Z]{2,13}$/.test(icDph) ? icDph : "";
  const dic = cisteDic(s?.dic) || dicZIcDph(platneIcDph);
  const ico = cisteIco(s?.ico);
  return {
    ico: ico.length >= 6 ? ico : "",
    dic: dic.length >= 8 ? dic : "",
    icDph: platneIcDph,
  };
}

function slova(nazov: string): Set<string> {
  return new Set(nazov.split(" ").filter((s) => s.length >= 3));
}

/** Sedia názvy? Rovnaké, jeden v druhom, alebo spoločné slovo (aspoň 3 znaky). */
export function nazvySedia(a: unknown, b: unknown): boolean | null {
  const x = normalizujNazov(a);
  const y = normalizujNazov(b);
  if (x.length < 3 || y.length < 3) return null;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const sx = slova(x);
  for (const s of slova(y)) if (sx.has(s)) return true;
  return false;
}

/** Je strana dokladu touto firmou (podľa IČO, DIČ alebo IČ DPH)? */
function jeFirma(strana: Cisla, firma: Cisla): boolean {
  return (
    (!!strana.ico && strana.ico === firma.ico) ||
    (!!strana.dic && strana.dic === firma.dic) ||
    (!!strana.icDph && strana.icDph === firma.icDph) ||
    // Česká právnická osoba: DIČ je „CZ“ + IČO.
    (!!strana.dic && strana.dic.length === 8 && strana.dic === firma.ico) ||
    (!!firma.dic && firma.dic.length === 8 && firma.dic === strana.ico)
  );
}

/**
 * Nepatrí doklad firme? Vráti, čo uložiť na doklad, alebo `null` (sedí,
 * alebo sa to nedá povedať).
 */
export function overOdberatela(args: {
  odberatel: Strana | null | undefined;
  /** Dodávateľ z dokladu — keď je ním firma, ide o jej vystavenú faktúru. */
  dodavatel?: Strana | null;
  firma: Strana;
}): OdberatelNesedi | null {
  const o = args.odberatel;
  if (!o) return null;
  const odb = cisla(o);
  const fir = cisla(args.firma);
  if (args.dodavatel && jeFirma(cisla(args.dodavatel), fir)) return null;
  const zapis = (dovod: OdberatelNesedi["dovod"]): OdberatelNesedi => ({
    dovod,
    odberatel: {
      nazov: String(o.nazov ?? "").trim() || null,
      ico: String(o.ico ?? "").replace(/\s/g, "") || null,
      dic: String(o.dic ?? "").replace(/\s/g, "") || null,
      ic_dph: cisteKod(o.icDph) || null,
    },
    firma: { nazov: String(args.firma.nazov ?? "").trim() || null },
  });

  if (jeFirma(odb, fir)) return null;
  // Čísla, ktoré sa dajú porovnať (sú na doklade aj na firme).
  const porovnatelne: OdberatelNesedi["dovod"][] = [];
  if (odb.ico && fir.ico) porovnatelne.push("ico");
  if (odb.icDph && fir.icDph) porovnatelne.push("ic_dph");
  if (odb.dic && fir.dic) porovnatelne.push("dic");
  if (porovnatelne.length) return zapis(porovnatelne[0]!);

  /*
    Žiadne číslo sa porovnať nedá — slabší doplnok podľa názvu. Len keď je
    odberateľ zjavne obchodná spoločnosť (s.r.o., a.s., GmbH…): živnostníkovi
    chodia faktúry aj na meno a priezvisko, ktoré sa s obchodným menom nezhoduje.
  */
  if (jeSpolocnost(o.nazov) && nazvySedia(o.nazov, args.firma.nazov) === false)
    return zapis("nazov");
  return null;
}

/** Názov s právnou formou obchodnej spoločnosti. */
export function jeSpolocnost(nazov: unknown): boolean {
  const s = String(nazov ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return /(\bs\.?\s?r\.?\s?o\b|\bspol\b|\ba\.\s?s\b|\bk\.\s?s\b|\bv\.\s?o\.\s?s\b|\bgmbh\b|\bag\b|\bltd\b|\bdruzstvo\b|\bz\.\s?s\b)/.test(
    s,
  );
}

/** Odberateľ z výsledku AI (`buyer_*`) alebo z vloženého ISDOC / UBL. */
export function odberatelZAi(ai: Record<string, unknown> | null | undefined): Strana | null {
  if (!ai) return null;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const o = {
    nazov: s(ai.buyer_name),
    ico: s(ai.buyer_ico),
    dic: s(ai.buyer_dic),
    icDph: s(ai.buyer_ic_dph),
  };
  return o.nazov || o.ico || o.dic || o.icDph ? o : null;
}

/** Dodávateľ z výsledku AI. */
export function dodavatelZAi(ai: Record<string, unknown> | null | undefined): Strana | null {
  if (!ai) return null;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    nazov: s(ai.supplier_name),
    ico: s(ai.supplier_ico),
    dic: s(ai.supplier_dic),
    icDph: s(ai.supplier_ic_dph),
  };
}

/** Firma z riadku `companies`. */
export function firmaZRiadku(c: {
  name?: string | null;
  ico?: string | null;
  dic?: string | null;
  ic_dph?: string | null;
}): Strana {
  return { nazov: c.name ?? null, ico: c.ico ?? null, dic: c.dic ?? null, icDph: c.ic_dph ?? null };
}

/** Uložený príznak z databázy (jsonb) — alebo null, keď tam nič rozumné nie je. */
export function nacitajNesedi(v: unknown): OdberatelNesedi | null {
  if (!v || typeof v !== "object") return null;
  const x = v as Record<string, any>;
  const o = (x.odberatel ?? {}) as Record<string, unknown>;
  const s = (y: unknown) => (typeof y === "string" && y.trim() ? y.trim() : null);
  const dovod = ["ico", "dic", "ic_dph", "nazov"].includes(x.dovod) ? x.dovod : "ico";
  return {
    dovod,
    odberatel: { nazov: s(o.nazov), ico: s(o.ico), dic: s(o.dic), ic_dph: s(o.ic_dph) },
    firma: { nazov: s(x.firma?.nazov) },
    ...(s(x.zistene_at) ? { zistene_at: s(x.zistene_at)! } : {}),
  };
}

/** Má riadok prijatej faktúry príznak? */
export function jeCudzia(r: { odberatel_nesedi?: unknown } | null | undefined): boolean {
  return Boolean(r?.odberatel_nesedi);
}

/** Čísla odberateľa do textu („IČO 12345678, IČ DPH SK…“). */
export function cislaOdberatela(n: OdberatelNesedi): string {
  const o = n.odberatel;
  return [
    o.ico ? `IČO ${o.ico}` : "",
    o.dic && !o.ic_dph ? `DIČ ${o.dic}` : "",
    o.ic_dph ? `IČ DPH ${o.ic_dph}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Text upozornenia po slovensky (server, export, API). Rozhranie skladá ten
 * istý text cez `t()` v `CudziaFakturaUpozornenie`.
 */
export function textNesedi(n: OdberatelNesedi): string {
  const kto = n.odberatel.nazov || "iná firma";
  const c = cislaOdberatela(n);
  return `Faktúra nepatrí firme ${n.firma.nazov || "v ktorej je"}, odberateľ je ${kto}${c ? ` (${c})` : ""}.`;
}

/** Dôvod vynechania z exportu, odovzdania a príkazu na úhradu (bez čísla dokladu). */
export const DOVOD_CUDZIA =
  "faktúra nepatrí tejto firme (odberateľ na doklade je iná firma) — skontrolujte ju a potvrďte, že patrí tejto firme, alebo ju presuňte či zmažte";

/** Dôvod pri zaúčtovaní (ručné aj hromadné). */
export const DOVOD_CUDZIA_ZAUCTOVANIE =
  "nepatrí tejto firme (iný odberateľ) — najprv potvrďte, že patrí tejto firme";

/** Predpona chyby pri Vytvoriť v Nespracovaných — rozhranie podľa nej ukáže voľby. */
export const PREDPONA_CUDZEJ = "CUDZIA_FAKTURA:";

/** Chyba s príznakom pre rozhranie (JSON za predponou). */
export function chybaCudzej(n: OdberatelNesedi): string {
  return `${PREDPONA_CUDZEJ}${JSON.stringify(n)}`;
}

/** Príznak z textu chyby (`chybaCudzej`), inak null. */
export function nesediZChyby(sprava: unknown): OdberatelNesedi | null {
  const s = String(sprava ?? "");
  const i = s.indexOf(PREDPONA_CUDZEJ);
  if (i < 0) return null;
  try {
    return nacitajNesedi(JSON.parse(s.slice(i + PREDPONA_CUDZEJ.length)));
  } catch {
    return null;
  }
}

/**
 * Firmy, ku ktorým sa dá faktúra presunúť: tie z Faktera, ktorých IČO, DIČ
 * alebo IČ DPH sedí na odberateľa, a len tie, kde smie človek zapisovať
 * doklady. Ostatné sa neprezradia ani menom, ani počtom — rozhranie ukáže
 * rovnakú vetu, či taká firma vo Faktere je, alebo nie.
 */
export function cieleNaPresun(
  n: OdberatelNesedi,
  firmy: {
    id: string;
    name?: string | null;
    ico?: string | null;
    dic?: string | null;
    ic_dph?: string | null;
  }[],
  sPravom: string[],
  zdrojovaId: string,
): { id: string; nazov: string }[] {
  const odb = cisla({ ico: n.odberatel.ico, dic: n.odberatel.dic, icDph: n.odberatel.ic_dph });
  if (!odb.ico && !odb.dic && !odb.icDph) return [];
  const povolene = new Set(sPravom);
  return firmy
    .filter((f) => f.id !== zdrojovaId && povolene.has(f.id))
    .filter((f) => jeFirma(odb, cisla(firmaZRiadku(f))))
    .map((f) => ({ id: f.id, nazov: String(f.name ?? "").trim() || "Firma" }));
}

/**
 * Stĺpce prijatej faktúry, ktoré sa pri presune do inej firmy vyprázdnia —
 * väzby na číselníky, pravidlá a zaúčtovanie zdrojovej firmy. Cieľová firma
 * ich nemá a zaúčtuje si faktúru po svojom.
 */
export const VYPRAZDNIT_PRI_PRESUNE: Record<string, null | boolean | string> = {
  pravidlo_id: null,
  pohoda_predkontacia: null,
  pohoda_clenenie_dph: null,
  kv_clenenie: null,
  rozuctovanie: null,
  stredisko: null,
  cinnost: null,
  pohoda_rad: null,
  category: null,
  zauctovane_at: null,
  zauctoval: null,
  zauctovanie_zdroj: null,
  zauctovanie_istota: null,
  auto_uctovanie_navrh: null,
  auto_uctovanie_at: null,
  oprava_zauctovania_at: null,
  oprava_zauctovania_povodne: null,
  na_kontrolu_at: null,
  job_id: null,
  customer_id: null,
  vehicle_id: null,
  stav_id: null,
  number_series_id: null,
  advance_invoice_id: null,
  opravuje_id: null,
  vyuctovanie_id: null,
  export_job_id: null,
  inbox_message_id: null,
  stitky: null,
  komentar: null,
  int_poznamka: null,
  spracoval: null,
  spracovane_at: null,
  locked_at: null,
  locked_by: null,
  naskladnene_at: null,
  payment_date: null,
  pdf_token: null,
};

/**
 * Smie sa faktúra presunúť? Odovzdaná do Pohody, samofaktúra či zmazaná nie
 * — vráti dôvod, inak null.
 */
export function prekazkaPresunu(r: {
  exported_at?: string | null;
  deleted_at?: string | null;
  samofakturacia?: boolean | null;
  locked_at?: string | null;
}): string | null {
  if (r.deleted_at) return "Faktúra je v koši.";
  if (r.exported_at) return "Faktúra je odovzdaná do účtovníctva — najprv ju vráťte z Pohody.";
  if (r.samofakturacia) return "Samofaktúra sa medzi firmami nepresúva.";
  if (r.locked_at) return "Faktúra je zamknutá.";
  return null;
}
