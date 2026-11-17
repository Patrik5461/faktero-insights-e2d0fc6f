/*
  Vlastná vystavená faktúra v Nespracovaných dokladoch.

  Do Nespracovaných sa dostane aj kópia faktúry, ktorú firma sama vystavila —
  PDF z migrácie z Doklada (`fa_<Firma>_<číslo>`, `dob_<Firma>_<číslo>`),
  preposlaný mail, omylom nahraté. Medzi prijaté nepatrí (z výnosu by urobila
  náklad). Druh „Vydaná faktúra“ ju priradí k vystavenej faktúre, ktorá už
  vo Fakturácii je (súbor ide medzi jej prílohy), a keď tam nie je, vystavenú
  faktúru z dokladu založí — vždy s číslom z dokladu, mimo číselného radu.

  Čisté funkcie: číslo z názvu súboru, signály vlastnej faktúry, výber
  zhody medzi vystavenými a faktúra z údajov.
*/
import { jeStranaFirmou, type Strana } from "./cudzia-faktura";
import { vlastnyUcetDokladu, type UcetFirmy } from "./nespracovane-iban";
import type { UdajeNespracovaneho } from "./nespracovane";

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const s = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const cislo_ = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Text na preklad cez `t()` s parametrami. */
export type Dovod = { text: string; params?: Record<string, string | number> };

/** Predpony súborov vystavených dokladov (Doklado: `fa_<Firma>_<číslo>`, `dob_…`). */
const PREDPONY = /^(fa|fv|vf|fak|faktura|dob|dobropis|zf|zal|zalohova|ddp)$/i;

/**
 * Číslo dokladu z názvu súboru `fa_<Firma>_<číslo>` / `dob_<Firma>_<číslo>`.
 * Samotné nestačí na záver, že ide o vlastnú faktúru — rovnaké číslo môže mať
 * aj dodávateľ; preto sa berie len spolu s ďalšími znakmi.
 */
export function cisloZNazvuSuboru(nazov: string | null | undefined): { cislo: string; dobropis: boolean } | null {
  const zaklad = s(nazov)
    .split("/")
    .pop()!
    .replace(/\.(pdf|png|jpe?g|webp|heic|xml|isdoc)$/i, "")
    // Cesta v úložisku z migrácie má pred názvom poradie („0-fa_…“).
    .replace(/^\d+-(?=[A-Za-z])/, "");
  const casti = zaklad.split("_").filter(Boolean);
  if (casti.length < 2 || !PREDPONY.test(casti[0]!)) return null;
  const posledna = casti[casti.length - 1]!;
  if (!/\d/.test(posledna) || posledna.length > 40 || !/^[A-Za-z0-9/.-]+$/.test(posledna)) return null;
  return { cislo: posledna, dobropis: /^dob/i.test(casti[0]!) };
}

/** Číslo na porovnanie — bez medzier, veľkými písmenami. */
export function normalizujCislo(v: unknown): string {
  return s(v).replace(/\s+/g, "").toUpperCase();
}

/** Číslo vystavenej faktúry: z údajov, z AI, inak z názvu súboru. */
export function cisloVydanej(
  u: Pick<UdajeNespracovaneho, "cislo"> | null | undefined,
  ai: Record<string, unknown> | null | undefined,
  nazovSuboru: string | null | undefined,
): string {
  return s(u?.cislo) || s(ai?.invoice_number) || cisloZNazvuSuboru(nazovSuboru)?.cislo || "";
}

/** Suma dokladu: zadaná, z dokladu, z rozpisu, inak z AI. */
export function sumaVydanej(
  u: Partial<Pick<UdajeNespracovaneho, "celkom" | "celkomDokladu" | "rozpis">> | null | undefined,
  ai?: Record<string, unknown> | null,
): number | null {
  const z = cislo_(u?.celkom) ?? cislo_(u?.celkomDokladu);
  if (z != null) return z;
  if (Array.isArray(u?.rozpis) && u!.rozpis!.length)
    return r2(u!.rozpis!.reduce((a, x) => a + Number(x.zaklad || 0) + Number(x.dph || 0), 0));
  return cislo_(ai?.amount_total);
}

/** Sedí suma (bez ohľadu na znamienko — dobropis býva raz kladný, raz záporný)? null = nedá sa povedať. */
export function sumaSedi(a: number | null | undefined, b: number | null | undefined): boolean | null {
  if (a == null || b == null || !Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return null;
  return Math.abs(Math.abs(Number(a)) - Math.abs(Number(b))) < 0.015;
}

/** Vystavená faktúra firmy na výber (zoznam aj zhoda). */
export type KandidatVydanej = {
  id: string;
  invoice_number: string;
  type?: string | null;
  status?: string | null;
  customer_name?: string | null;
  issue_date?: string | null;
  total?: number | string | null;
  currency?: string | null;
};

export type ZhodaVydanej = { faktura: KandidatVydanej; sumaSedi: boolean | null };

/**
 * Vystavená faktúra s rovnakým číslom. Keď ich je viac (nemalo by), vyhrá
 * tá, ktorej sedí suma. Len presné číslo — „podobné“ by priradilo cudziu.
 */
export function zhodaVydanej(
  kandidati: readonly KandidatVydanej[],
  cislo: string,
  suma: number | null,
): ZhodaVydanej | null {
  const c = normalizujCislo(cislo);
  if (!c) return null;
  const rovnake = kandidati.filter((k) => normalizujCislo(k.invoice_number) === c);
  if (!rovnake.length) return null;
  const sSumou = rovnake.find((k) => sumaSedi(suma, cislo_(k.total)) === true);
  const f = sSumou ?? rovnake[0]!;
  return { faktura: f, sumaSedi: sumaSedi(suma, cislo_(f.total)) };
}

/** Firma na porovnanie — čísla (IČO, DIČ, IČ DPH) a firemné účty. */
export type FirmaPreVydanu = { strana: Strana; ucty?: UcetFirmy[] };

export type NavrhVydanej = {
  /** Vyzerá to ako vlastná vystavená faktúra. */
  navrh: boolean;
  dovody: Dovod[];
  /** Číslo, podľa ktorého sa hľadá vystavená faktúra. */
  cislo: string;
  suma: number | null;
  zhoda: ZhodaVydanej | null;
};

/**
 * Znaky vlastnej vystavenej faktúry:
 * - dodávateľ na doklade je firma (IČO, DIČ, IČ DPH) a odberateľ nie;
 * - IBAN príjemcu platby je firemný účet;
 * - číslo z názvu súboru `fa_…_<číslo>` má vystavená faktúra s rovnakou sumou
 *   (samotný názov súboru nestačí).
 */
export function navrhVydanej(args: {
  udaje: UdajeNespracovaneho | null | undefined;
  ai?: Record<string, unknown> | null;
  nazovSuboru?: string | null;
  firma: FirmaPreVydanu | null | undefined;
  kandidati: readonly KandidatVydanej[];
}): NavrhVydanej {
  const { udaje: u, ai, firma } = args;
  const cislo = cisloVydanej(u, ai, args.nazovSuboru);
  const suma = sumaVydanej(u, ai);
  const zhoda = zhodaVydanej(args.kandidati, cislo, suma);
  const dovody: Dovod[] = [];
  if (firma) {
    const dod = u?.dodavatel;
    const dodavatel: Strana = {
      nazov: s(dod?.nazov) || s(ai?.supplier_name) || null,
      ico: s(dod?.ico) || s(ai?.supplier_ico) || null,
      dic: s(dod?.dic) || s(ai?.supplier_dic) || null,
      icDph: s(dod?.icDph) || s(ai?.supplier_ic_dph) || null,
    };
    const odberatel: Strana | null = ai
      ? { nazov: s(ai.buyer_name) || null, ico: s(ai.buyer_ico) || null, dic: s(ai.buyer_dic) || null, icDph: s(ai.buyer_ic_dph) || null }
      : null;
    const dodavatelJeFirma = jeStranaFirmou(dodavatel, firma.strana);
    const odberatelJeFirma = jeStranaFirmou(odberatel, firma.strana);
    if (dodavatelJeFirma && !odberatelJeFirma)
      dovody.push({ text: "Dodávateľ na doklade je vaša firma (IČO / DIČ / IČ DPH)." });
    /*
      Firemný IBAN je signál len vtedy, keď mu identifikácia strán neodporuje:
      odberateľ je podľa IČO / DIČ / IČ DPH firma a dodávateľ iný subjekt =
      prijatá faktúra, aj keď sa IBAN zhoduje (preklep, cudzí účet zle prečítaný
      ako príjemca, testovací IBAN). Inak by ju appka nechala bez druhu (17. 11.).
    */
    const ucet = vlastnyUcetDokladu(s(dod?.iban) || s(ai?.supplier_iban), firma.ucty ?? []);
    const stranyOdporuju = odberatelJeFirma && !dodavatelJeFirma && Boolean(dodavatel.ico || dodavatel.dic || dodavatel.icDph);
    if (ucet && !stranyOdporuju) dovody.push({ text: "IBAN {iban} na doklade je váš.", params: { iban: ucet.iban } });
  }
  const zoSuboru = cisloZNazvuSuboru(args.nazovSuboru);
  if (
    zoSuboru &&
    zhoda &&
    zhoda.sumaSedi === true &&
    normalizujCislo(zoSuboru.cislo) === normalizujCislo(zhoda.faktura.invoice_number)
  )
    dovody.push({
      text: "Názov súboru aj suma sedia na vašu vystavenú faktúru {cislo}.",
      params: { cislo: zhoda.faktura.invoice_number },
    });
  return { navrh: dovody.length > 0, dovody, cislo, suma, zhoda };
}

/**
 * Hromadné „Priradiť k vystaveným faktúram“: priradí sa len doklad, ktorý je
 * vydanou faktúrou (druh alebo návrh) a k číslu má vystavenú faktúru, ktorej
 * suma neodporuje. Ostatné sa preskočia s dôvodom.
 */
export function rozhodnutiePriradenia(args: {
  druh: string | null | undefined;
  stav?: string | null;
  maSubor: boolean;
  navrh: NavrhVydanej;
}): { invoiceId: string } | { dovod: Dovod } {
  if (args.stav === "cita") return { dovod: { text: "Doklad sa ešte číta" } };
  if (!args.maSubor) return { dovod: { text: "Doklad nemá súbor, ktorý by sa dal priložiť" } };
  const n = args.navrh;
  if (args.druh !== "vydana" && !n.navrh)
    return { dovod: { text: "Nevyzerá ako vaša vystavená faktúra — v detaile určte druh Vydaná faktúra" } };
  if (!n.cislo) return { dovod: { text: "Na doklade nie je číslo faktúry" } };
  if (!n.zhoda)
    return { dovod: { text: "Vystavená faktúra {cislo} sa nenašla — otvorte doklad a vyberte ju alebo ju vytvorte", params: { cislo: n.cislo } } };
  if (n.zhoda.sumaSedi === false)
    return {
      dovod: {
        text: "Suma nesedí s vystavenou faktúrou {cislo} — rozhodnite v detaile",
        params: { cislo: n.zhoda.faktura.invoice_number },
      },
    };
  return { invoiceId: n.zhoda.faktura.id };
}

/** Text súhrnu hromadného priradenia. */
export function textPriradenia(priradene: number, preskocene: number): Dovod {
  if (!priradene && !preskocene) return { text: "Nebolo čo priradiť" };
  if (!preskocene) return { text: "Priradené k vystaveným faktúram: {n}", params: { n: priradene } };
  return { text: "Priradené {ok}, preskočené {n}", params: { ok: priradene, n: preskocene } };
}

/** Názov prílohy: pôvodný názov súboru s príponou podľa typu. */
export function nazovPrilohy(nazovSuboru: string | null | undefined, cislo: string, pripona: string): string {
  const meno = s(nazovSuboru).split("/").pop() || (cislo ? `Doklad ${cislo}` : "Doklad");
  const ma = new RegExp(`\\.${pripona}$`, "i").test(meno);
  return (ma ? meno : `${meno}.${pripona}`).slice(0, 200);
}

/** Odberateľ vystavenej faktúry z nespracovaného dokladu. */
export type OdberatelVydanej = {
  name: string;
  ico: string | null;
  dic: string | null;
  ic_dph: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string | null;
};

/**
 * Odberateľ: keď je dodávateľom v údajoch firma (AI čítala faktúru správne),
 * je odberateľ v `buyer_*` z AI. Inak údaje dodávateľa nesú partnera —
 * tak ich ukladá migrácia z Doklada (pri vystavenej faktúre je partnerom
 * odberateľ).
 */
export function odberatelVydanej(
  u: UdajeNespracovaneho,
  ai: Record<string, unknown> | null | undefined,
  firma: Strana | null | undefined,
): OdberatelVydanej | null {
  const d = u.dodavatel;
  const dodavatelJeFirma = jeStranaFirmou({ nazov: d.nazov, ico: d.ico, dic: d.dic, icDph: d.icDph }, firma);
  if (dodavatelJeFirma || (!s(d.nazov) && ai)) {
    if (!ai || !s(ai.buyer_name)) return null;
    return {
      name: s(ai.buyer_name).slice(0, 200),
      ico: s(ai.buyer_ico).replace(/\s/g, "") || null,
      dic: s(ai.buyer_dic) || null,
      ic_dph: s(ai.buyer_ic_dph).replace(/\s/g, "").toUpperCase() || null,
      street: s(ai.buyer_street) || null,
      city: s(ai.buyer_city) || null,
      zip: s(ai.buyer_zip) || null,
      country: s(ai.buyer_country).toUpperCase().slice(0, 2) || null,
    };
  }
  if (!s(d.nazov)) return null;
  return {
    name: s(d.nazov).slice(0, 200),
    ico: s(d.ico).replace(/\s/g, "") || null,
    dic: s(d.dic) || null,
    ic_dph: s(d.icDph).replace(/\s/g, "").toUpperCase() || null,
    street: s(d.ulica) || null,
    city: s(d.mesto) || null,
    zip: s(d.psc) || null,
    country: s(d.krajina).toUpperCase().slice(0, 2) || null,
  };
}

export type PolozkaVydanej = {
  position: number;
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  subtotal: number;
  vat_amount: number;
  total: number;
};

export type FakturaZDokladu =
  | { ok: false; dovod: string }
  | {
      ok: true;
      dobropis: boolean;
      faktura: {
        invoice_number: string;
        type: "regular" | "credit_note";
        issue_date: string;
        delivery_date: string;
        due_date: string;
        currency: string;
        variable_symbol: string | null;
        customer: OdberatelVydanej;
        subtotal: number;
        vat_total: number;
        total: number;
      };
      polozky: PolozkaVydanej[];
    };

export const NECITATELNY =
  "Doklad nemá čitateľné údaje — vytvorte faktúru ručne a doklad k nej priraďte.";

/**
 * Vystavená faktúra z údajov nespracovaného dokladu. Číslo je z dokladu
 * (nie z číselného radu), sumy z rozpisu DPH. Položky sa prevezmú, len keď
 * po sadzbách sedia s rozpisom — inak jedna položka na sadzbu („Plnenie
 * podľa dokladu …“), ako pri migrácii z Doklada. Dobropis má sumy záporné
 * (množstvo −1, jednotková cena kladná — ako dobropis vystavený vo Fakteri).
 */
export function fakturaZDokladu(args: {
  udaje: UdajeNespracovaneho;
  ai?: Record<string, unknown> | null;
  nazovSuboru?: string | null;
  firma: Strana | null | undefined;
  /** Mena firmy — keď doklad menu nemá. */
  menaFirmy?: string | null;
}): FakturaZDokladu {
  const u = args.udaje;
  const ai = args.ai ?? null;
  const zoSuboru = cisloZNazvuSuboru(args.nazovSuboru);
  const cislo = cisloVydanej(u, ai, args.nazovSuboru).slice(0, 60);
  const vystavenie = s(u.datumVystavenia);
  const odberatel = odberatelVydanej(u, ai, args.firma);
  if (!cislo || !/^\d{4}-\d{2}-\d{2}$/.test(vystavenie) || !odberatel) return { ok: false, dovod: NECITATELNY };

  const celkomDokladu = cislo_(u.celkomDokladu) ?? cislo_(u.celkom);
  let rozpis = (u.rozpis ?? []).filter((r) => Number(r.zaklad) || Number(r.dph));
  if (!rozpis.length) return { ok: false, dovod: NECITATELNY };
  const dobropis =
    Boolean(zoSuboru?.dobropis) ||
    s(ai?.document_subtype).toLowerCase() === "dobropis" ||
    (celkomDokladu ?? 0) < 0 ||
    rozpis.every((r) => Number(r.zaklad) + Number(r.dph) < 0);
  rozpis = rozpis.map((r) => ({ ...r, zaklad: Math.abs(Number(r.zaklad)), dph: Math.abs(Number(r.dph)) }));
  const zaklad = r2(rozpis.reduce((a, r) => a + r.zaklad, 0));
  const dph = r2(rozpis.reduce((a, r) => a + r.dph, 0));
  const spolu = r2(zaklad + dph);
  if (celkomDokladu != null && Math.abs(Math.abs(celkomDokladu) - spolu) > 0.05)
    return { ok: false, dovod: "Súčet rozpisu DPH nesedí so sumou dokladu — opravte údaje v druhu Prijatá faktúra alebo vytvorte faktúru ručne." };

  const z = dobropis ? -1 : 1;
  // Znamienko dobropisu bez „−0“ pri nulovej dani.
  const zn = (n: number) => (z * n === 0 ? 0 : z * n);
  // Položky z dokladu, keď po sadzbách sedia so základom rozpisu (na 2 centy).
  let polozky: PolozkaVydanej[] = [];
  const pz = (u.polozky ?? []).filter((p) => s(p.name) && p.quantity != null && p.unit_price != null && p.vat_rate != null);
  if (pz.length && pz.length === (u.polozky ?? []).length) {
    const kandidat = pz.map((p, i) => {
      const q = Math.abs(Number(p.quantity));
      const cena = Math.abs(Number(p.unit_price));
      const sub = r2(q * cena);
      const dan = r2((sub * Number(p.vat_rate)) / 100);
      return {
        position: i + 1,
        name: s(p.name).slice(0, 500),
        quantity: z * q,
        unit: s(p.unit) || "ks",
        unit_price: cena,
        vat_rate: Number(p.vat_rate),
        subtotal: zn(sub),
        vat_amount: zn(dan),
        total: zn(r2(sub + dan)),
      };
    });
    const sedi = rozpis.every((r) => {
      const v = kandidat.filter((k) => Math.abs(k.vat_rate - Number(r.sadzba)) < 0.001);
      return (
        Math.abs(Math.abs(v.reduce((a, k) => a + k.subtotal, 0)) - r.zaklad) <= 0.02 &&
        Math.abs(Math.abs(v.reduce((a, k) => a + k.vat_amount, 0)) - r.dph) <= 0.02
      );
    });
    const vsetkySadzby = kandidat.every((k) => rozpis.some((r) => Math.abs(k.vat_rate - Number(r.sadzba)) < 0.001));
    if (sedi && vsetkySadzby) polozky = kandidat;
  }
  if (!polozky.length)
    polozky = rozpis.map((r, i) => ({
      position: i + 1,
      name: `Plnenie podľa dokladu ${cislo}`,
      quantity: z,
      unit: "ks",
      unit_price: r2(r.zaklad),
      vat_rate: Number(r.sadzba),
      subtotal: zn(r2(r.zaklad)),
      vat_amount: zn(r2(r.dph)),
      total: zn(r2(r.zaklad + r.dph)),
    }));
  const dodanie = /^\d{4}-\d{2}-\d{2}$/.test(s(u.datumDodania)) ? s(u.datumDodania) : vystavenie;
  const splatnost = /^\d{4}-\d{2}-\d{2}$/.test(s(u.splatnost)) ? s(u.splatnost) : vystavenie;
  return {
    ok: true,
    dobropis,
    faktura: {
      invoice_number: cislo,
      type: dobropis ? "credit_note" : "regular",
      issue_date: vystavenie,
      delivery_date: dodanie,
      due_date: splatnost < vystavenie ? vystavenie : splatnost,
      currency: (s(u.mena) || s(args.menaFirmy) || "EUR").toUpperCase().slice(0, 3),
      variable_symbol: s(u.vs).replace(/\s/g, "").slice(0, 20) || null,
      customer: odberatel,
      subtotal: zn(zaklad),
      vat_total: zn(dph),
      total: zn(spolu),
    },
    polozky,
  };
}
