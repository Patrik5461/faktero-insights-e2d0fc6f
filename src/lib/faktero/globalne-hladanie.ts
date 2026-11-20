/*
  Hľadanie v hlavičke (⌘K) — čisté funkcie, ktoré zdieľa server a testy.

  Jeden dotaz prehľadá aktívnu firmu naprieč agendami. Filtrovanie robí
  databáza (PostgREST `or` s `ilike`/`imatch`, limit na skupinu), nič sa
  nenačítava po tisícoch. Názov partnera sa porovnáva bez diakritiky
  regulárnym výrazom (`regexNazvu`) — rozšírenie `unaccent` netreba.

  Skupina sa vôbec nepýta, keď ju človek s rolou „Vlastný prístup“ nevidí
  (`vidiOblast`); databáza to stráži aj sama (`firmy_s_pravom` v RLS).
*/
import { normalizuj, regexNazvu, sedyNazov } from "./hladanie-text";
import { sumaZHladania } from "./hladanie-sumy";
import { vidiOblast, type Oblast } from "./opravnenia";
import type { TonStavu } from "@/components/faktero/web/Stav";

export type SkupinaHladania =
  | "vystavene"
  | "prijate"
  | "blocky"
  | "nespracovane"
  | "kontakty"
  | "ponuky"
  | "banka"
  | "zakazky";

export const PORADIE_SKUPIN: SkupinaHladania[] = [
  "vystavene",
  "prijate",
  "blocky",
  "nespracovane",
  "kontakty",
  "ponuky",
  "banka",
  "zakazky",
];

/** Oblasť vlastného prístupu, ktorá skupinu stráži (rovnaká ako pri ceste zoznamu). */
export const OBLAST_SKUPINY: Record<SkupinaHladania, Oblast> = {
  vystavene: "faktury",
  ponuky: "faktury",
  prijate: "doklady",
  blocky: "doklady",
  nespracovane: "doklady",
  kontakty: "kontakty",
  banka: "banka",
  zakazky: "zakazky",
};

/** Nadpis skupiny — slovenský kľúč pre `t()`. */
export const NAZOV_SKUPINY: Record<SkupinaHladania, string> = {
  vystavene: "Vystavené faktúry",
  prijate: "Prijaté faktúry",
  blocky: "Bločky a doklady",
  nespracovane: "Nespracované",
  kontakty: "Kontakty",
  ponuky: "Cenové ponuky",
  banka: "Bankové pohyby",
  zakazky: "Zákazky",
};

/** Skupiny, ktoré člen firmy smie vidieť. Iné roly než „custom“ vidia všetky. */
export function skupinyPreClena(rola: string | null | undefined, opr: unknown): SkupinaHladania[] {
  return PORADIE_SKUPIN.filter((s) => vidiOblast(rola, opr, OBLAST_SKUPINY[s]));
}

/** Najkratší dotaz, pri ktorom sa hľadá. */
export const MIN_DLZKA = 2;
/** Koľko výsledkov sa ukáže v jednej skupine. */
export const NA_SKUPINU = 5;
/** Koľko riadkov skupiny sa načíta na zoradenie (presná zhoda čísla hore). */
export const NACITAT_NA_SKUPINU = 12;

/* ---------- Rozbor dotazu ---------- */

export type RozborDotazu = {
  /** Upravený dotaz (medzery zlúčené, najviac 100 znakov). */
  text: string;
  /** Regulárny výraz pre názov partnera bez diakritiky, inak null. */
  nazov: string | null;
  /** Časť čísla dokladu / VS — bez znakov, ktoré by rozbili filter. */
  cislo: string | null;
  /** Len číslice (IČO, DIČ, VS) — od 3 číslic. */
  cifry: string | null;
  /** IČ DPH (SK2020…). */
  icDph: string | null;
  /** Suma (absolútna hodnota), tolerancia ± 0,01. */
  suma: number | null;
  /** IBAN alebo jeho časť, bez medzier, veľkými písmenami. */
  iban: string | null;
  /** E-mail alebo jeho časť (keď dotaz obsahuje „@“). */
  email: string | null;
};

export function upravDotaz(q: string | null | undefined): string {
  return String(q ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export function rozoberDotaz(q: string | null | undefined): RozborDotazu {
  const text = upravDotaz(q);
  const bezMedzier = text.replace(/\s/g, "");
  const maPismeno = /\p{L}/u.test(text);
  const cislo = text.replace(/[%_*,()"'\\\s]/g, "");
  const suma = sumaZHladania(text);
  const cifryLen = /^[\d\s/-]+$/.test(text) ? bezMedzier.replace(/\D/g, "") : "";
  const ibanTvar = bezMedzier.toUpperCase();
  const jeIban =
    /^[A-Z]{2}\d{2}[A-Z0-9]*$/.test(ibanTvar) && ibanTvar.length >= 6
      ? ibanTvar
      : /^\d{6,}$/.test(ibanTvar)
        ? ibanTvar
        : null;
  return {
    text,
    nazov: maPismeno && normalizuj(text).length >= MIN_DLZKA ? regexNazvu(text) : null,
    // „123,45“ je suma, nie číslo dokladu — „12345“ by našlo čokoľvek.
    cislo: cislo.length >= MIN_DLZKA && !(suma != null && /[.,]\d{1,2}$/.test(bezMedzier)) ? cislo : null,
    cifry: cifryLen.length >= 3 ? cifryLen : null,
    icDph: /^[A-Z]{2}\d{4,}$/.test(ibanTvar) ? ibanTvar : null,
    suma,
    iban: jeIban,
    email: text.includes("@") && cislo.length >= 3 ? cislo.toLowerCase() : null,
  };
}

/* ---------- Podmienky pre PostgREST ---------- */

/** Hodnota do `or=(…)` v úvodzovkách — čiarka ani zátvorka filter nerozbijú. */
export function uvodzovky(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const obsahuje = (stlpec: string, v: string) => `${stlpec}.ilike.${uvodzovky(`%${v}%`)}`;
const regex = (stlpec: string, v: string) => `${stlpec}.imatch.${uvodzovky(v)}`;

/** Suma ± 0,01 kladná aj záporná (dobropis, výdaj v banke). */
export function podmienkySumyRozsah(stlpec: string, suma: number): string[] {
  const r = (a: number, b: number) =>
    `and(${stlpec}.gte.${a.toFixed(2)},${stlpec}.lte.${b.toFixed(2)})`;
  return [r(suma - 0.01, suma + 0.01), r(-suma - 0.01, -suma + 0.01)];
}

/** Suma uložená ako text v JSON (`udaje->>celkom`) — „123.5“ aj „123.50“. */
function sumaVJson(stlpec: string, suma: number): string[] {
  const tvary = [...new Set([String(suma), suma.toFixed(2)])];
  return [`${stlpec}.in.(${tvary.map(uvodzovky).join(",")})`];
}

type DefSkupiny = {
  tabulka: string;
  stlpce: string;
  /** Stĺpec na zoradenie (najnovšie hore), pri kontaktoch meno. */
  poradie: { stlpec: string; vzostupne?: boolean };
  /** Skupina má `deleted_at` (kôš) — zmazané sa nehľadajú. */
  kos?: boolean;
  podmienky: (r: RozborDotazu) => string[];
};

export const DEF_SKUPIN: Record<SkupinaHladania, DefSkupiny> = {
  vystavene: {
    tabulka: "invoices",
    stlpce:
      "id, invoice_number, variable_symbol, customer_name, customer_ico, total, currency, issue_date, due_date, status, paid_at, type",
    poradie: { stlpec: "issue_date" },
    kos: true,
    podmienky: (r) => [
      ...(r.cislo ? [obsahuje("invoice_number", r.cislo), obsahuje("variable_symbol", r.cislo)] : []),
      ...(r.nazov ? [regex("customer_name", r.nazov)] : []),
      ...(r.cifry ? [obsahuje("customer_ico", r.cifry), obsahuje("customer_dic", r.cifry)] : []),
      ...(r.icDph ? [obsahuje("customer_dic", r.icDph.replace(/\D/g, ""))] : []),
      ...(r.suma != null ? podmienkySumyRozsah("total", r.suma) : []),
    ],
  },
  prijate: {
    tabulka: "purchase_invoices",
    stlpce:
      "id, invoice_number, variable_symbol, supplier_name, supplier_ico, amount_total, currency, issue_date, due_date, status, payment_date, type",
    poradie: { stlpec: "issue_date" },
    kos: true,
    podmienky: (r) => [
      ...(r.cislo ? [obsahuje("invoice_number", r.cislo), obsahuje("variable_symbol", r.cislo)] : []),
      ...(r.nazov ? [regex("supplier_name", r.nazov)] : []),
      ...(r.cifry ? [obsahuje("supplier_ico", r.cifry), obsahuje("supplier_dic", r.cifry)] : []),
      ...(r.icDph ? [obsahuje("supplier_dic", r.icDph.replace(/\D/g, ""))] : []),
      ...(r.iban ? [obsahuje("supplier_iban", r.iban)] : []),
      ...(r.suma != null ? podmienkySumyRozsah("amount_total", r.suma) : []),
    ],
  },
  blocky: {
    tabulka: "expense_documents",
    stlpce:
      "id, document_number, supplier_name, supplier_ico, total_amount, currency, issue_date, status",
    poradie: { stlpec: "issue_date" },
    podmienky: (r) => [
      ...(r.cislo ? [obsahuje("document_number", r.cislo)] : []),
      ...(r.nazov ? [regex("supplier_name", r.nazov)] : []),
      ...(r.cifry ? [obsahuje("supplier_ico", r.cifry), obsahuje("supplier_dic", r.cifry)] : []),
      ...(r.icDph ? [obsahuje("supplier_ic_dph", r.icDph)] : []),
      ...(r.suma != null ? podmienkySumyRozsah("total_amount", r.suma) : []),
    ],
  },
  nespracovane: {
    tabulka: "nespracovane_doklady",
    stlpce:
      "id, file_name, created_at, cislo:udaje->>cislo, dodavatel:udaje->dodavatel->>nazov, celkom:udaje->>celkom, mena:udaje->>mena, datum:udaje->>datumVystavenia",
    poradie: { stlpec: "created_at" },
    podmienky: (r) => [
      ...(r.cislo ? [obsahuje("udaje->>cislo", r.cislo)] : []),
      ...(r.nazov
        ? [regex("udaje->dodavatel->>nazov", r.nazov), regex("file_name", r.nazov)]
        : []),
      ...(r.cifry ? [obsahuje("ai->>supplier_ico", r.cifry)] : []),
      ...(r.icDph ? [obsahuje("ai->>supplier_ic_dph", r.icDph)] : []),
      ...(r.iban ? [obsahuje("ai->>supplier_iban", r.iban)] : []),
      ...(r.suma != null ? sumaVJson("udaje->>celkom", r.suma) : []),
    ],
  },
  kontakty: {
    tabulka: "customers",
    stlpce: "id, name, ico, email, city, odberatel, dodavatel",
    poradie: { stlpec: "name", vzostupne: true },
    kos: true,
    podmienky: (r) => [
      ...(r.nazov ? [regex("name", r.nazov)] : []),
      ...(r.cifry
        ? [obsahuje("ico", r.cifry), obsahuje("dic", r.cifry), obsahuje("ic_dph", r.cifry)]
        : []),
      ...(r.icDph ? [obsahuje("ic_dph", r.icDph)] : []),
      ...(r.iban ? [obsahuje("iban", r.iban)] : []),
      ...(r.email ? [obsahuje("email", r.email)] : []),
    ],
  },
  ponuky: {
    tabulka: "quotes",
    stlpce: "id, quote_number, customer_name, total, currency, issue_date, status",
    poradie: { stlpec: "issue_date" },
    kos: true,
    podmienky: (r) => [
      ...(r.cislo ? [obsahuje("quote_number", r.cislo)] : []),
      ...(r.nazov ? [regex("customer_name", r.nazov)] : []),
      ...(r.cifry ? [obsahuje("customer_ico", r.cifry)] : []),
      ...(r.suma != null ? podmienkySumyRozsah("total", r.suma) : []),
    ],
  },
  banka: {
    tabulka: "bank_transactions",
    stlpce:
      "id, bank_account_id, booking_date, amount, currency, variable_symbol, counterparty, counterparty_iban, description, matched_invoice_id, matched_purchase_invoice_id, matched_expense_id, matched_installment_id, matched_other_document_id",
    poradie: { stlpec: "booking_date" },
    podmienky: (r) => [
      ...(r.cislo ? [obsahuje("variable_symbol", r.cislo)] : []),
      ...(r.nazov ? [regex("counterparty", r.nazov), regex("description", r.nazov)] : []),
      ...(r.iban ? [obsahuje("counterparty_iban", r.iban)] : []),
      ...(r.suma != null ? podmienkySumyRozsah("amount", r.suma) : []),
    ],
  },
  zakazky: {
    tabulka: "jobs",
    stlpce: "id, job_number, name, customer_name, status, start_date, created_at",
    poradie: { stlpec: "created_at" },
    podmienky: (r) => [
      ...(r.cislo ? [obsahuje("job_number", r.cislo)] : []),
      ...(r.nazov ? [regex("name", r.nazov), regex("customer_name", r.nazov)] : []),
    ],
  },
};

/** Podmienky skupiny ako reťazec pre `.or()`; null = dotaz pre skupinu nedáva zmysel. */
export function filterSkupiny(s: SkupinaHladania, r: RozborDotazu): string | null {
  const p = DEF_SKUPIN[s].podmienky(r);
  return p.length ? p.join(",") : null;
}

/* ---------- Výsledky ---------- */

export type Navigacia = {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
};

export type VysledokHladania = {
  skupina: SkupinaHladania;
  id: string;
  /** Hlavný text riadka — číslo dokladu, meno kontaktu, protistrana. */
  cislo: string | null;
  /** Partner (odberateľ, dodávateľ…) alebo doplnok. */
  partner: string | null;
  /** IČO kontaktu — UI pred neho dá „IČO“. */
  ico?: string | null;
  suma: number | null;
  mena: string | null;
  datum: string | null;
  /** Stav — slovenský kľúč pre `t()` a tón odznaku. */
  stav: { text: string; ton: TonStavu } | null;
  odkaz: Navigacia;
};

export type SkupinaVysledkov = {
  skupina: SkupinaHladania;
  pocet: number;
  polozky: VysledokHladania[];
  /** „Zobraziť všetky“ — zoznam vyhľadaný podľa dotazu, ak to zoznam vie. */
  vsetky: Navigacia | null;
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));

function stavFaktury(
  r: { status?: string | null; due_date?: string | null; type?: string | null; suma?: number | null },
  uhradena: boolean,
  dnes: string,
): VysledokHladania["stav"] {
  if (r.status === "draft") return { text: "Koncept", ton: "neutralny" };
  if (r.status === "cancelled") return { text: "Stornovaná", ton: "zruseny" };
  // Dobropis: vystavený má typ, prijatý len záporné znamienko (faktero-dobropis-znamienko).
  if (r.type === "credit_note" || (r.suma != null && r.suma < 0))
    return { text: "Dobropis", ton: "informacia" };
  if (uhradena) return { text: "Uhradená", ton: "uspech" };
  if (r.due_date && r.due_date < dnes) return { text: "Po splatnosti", ton: "chyba" };
  return { text: "Neuhradená", ton: "priebeh" };
}

const STAV_BLOCKU: Record<string, VysledokHladania["stav"]> = {
  new: { text: "Nespracovaný", ton: "pozor" },
  processed: { text: "Spracovaný", ton: "uspech" },
  exported: { text: "Odovzdaný", ton: "informacia" },
};

const STAV_PONUKY: Record<string, VysledokHladania["stav"]> = {
  draft: { text: "Koncept", ton: "neutralny" },
  sent: { text: "Odoslaná", ton: "priebeh" },
  accepted: { text: "Akceptovaná", ton: "uspech" },
  rejected: { text: "Zamietnutá", ton: "chyba" },
  expired: { text: "Expirovaná", ton: "zruseny" },
  converted: { text: "Konvertovaná", ton: "informacia" },
};

const STAV_ZAKAZKY: Record<string, VysledokHladania["stav"]> = {
  active: { text: "Aktívna", ton: "informacia" },
  closed: { text: "Uzavretá", ton: "uspech" },
  cancelled: { text: "Zrušená", ton: "zruseny" },
};

/** Riadok z databázy → riadok výsledku. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapujRiadok(s: SkupinaHladania, r: any, dnes: string): VysledokHladania {
  const id = String(r.id);
  switch (s) {
    case "vystavene":
      return {
        skupina: s,
        id,
        cislo: str(r.invoice_number),
        partner: str(r.customer_name),
        suma: num(r.total),
        mena: str(r.currency),
        datum: str(r.issue_date),
        stav: stavFaktury(r, r.status === "paid" || Boolean(r.paid_at), dnes),
        odkaz: { to: "/faktury/$id", params: { id } },
      };
    case "prijate":
      return {
        skupina: s,
        id,
        cislo: str(r.invoice_number),
        partner: str(r.supplier_name),
        suma: num(r.amount_total),
        mena: str(r.currency),
        datum: str(r.issue_date),
        stav: stavFaktury(
          { ...r, suma: num(r.amount_total) },
          r.status === "paid" || Boolean(r.payment_date),
          dnes,
        ),
        odkaz: { to: "/prijate-faktury/$id", params: { id } },
      };
    case "blocky": {
      // Bloček nemá vlastnú stránku — otvorí sa zoznam dokladov vyhľadaný podľa čísla.
      const q = (str(r.document_number) ?? str(r.supplier_name) ?? "").slice(0, 80);
      return {
        skupina: s,
        id,
        cislo: str(r.document_number),
        partner: str(r.supplier_name),
        suma: num(r.total_amount),
        mena: str(r.currency),
        datum: str(r.issue_date),
        stav: STAV_BLOCKU[String(r.status)] ?? null,
        odkaz: { to: "/doklady", search: q ? { stav: "vsetky", q } : { stav: "vsetky" } },
      };
    }
    case "nespracovane":
      return {
        skupina: s,
        id,
        cislo: str(r.cislo) ?? str(r.file_name),
        partner: str(r.dodavatel),
        suma: num(r.celkom),
        mena: str(r.mena) ?? "EUR",
        datum: str(r.datum) ?? (str(r.created_at)?.slice(0, 10) || null),
        stav: { text: "Čaká na spracovanie", ton: "pozor" },
        odkaz: { to: "/nespracovane/$id", params: { id } },
      };
    case "kontakty": {
      const len = r.dodavatel && !r.odberatel;
      const q = (str(r.name) ?? "").slice(0, 80);
      return {
        skupina: s,
        id,
        cislo: str(r.name),
        partner: str(r.city) ?? str(r.email),
        ico: str(r.ico),
        suma: null,
        mena: null,
        datum: null,
        stav: {
          text:
            r.dodavatel && r.odberatel ? "Odberateľ a dodávateľ" : len ? "Dodávateľ" : "Odberateľ",
          ton: "neutralny",
        },
        odkaz: { to: len ? "/dodavatelia" : "/odberatelia", ...(q ? { search: { q } } : {}) },
      };
    }
    case "ponuky":
      return {
        skupina: s,
        id,
        cislo: str(r.quote_number),
        partner: str(r.customer_name),
        suma: num(r.total),
        mena: str(r.currency),
        datum: str(r.issue_date),
        stav: STAV_PONUKY[String(r.status)] ?? null,
        odkaz: { to: "/ponuky/$id", params: { id } },
      };
    case "banka": {
      const suma = num(r.amount);
      const sparovany = Boolean(
        r.matched_invoice_id ||
          r.matched_purchase_invoice_id ||
          r.matched_expense_id ||
          r.matched_installment_id ||
          r.matched_other_document_id,
      );
      const vs = str(r.variable_symbol);
      return {
        skupina: s,
        id,
        cislo: str(r.counterparty) ?? str(r.description)?.slice(0, 80) ?? null,
        partner: vs ? `VS ${vs}` : str(r.counterparty_iban),
        suma,
        mena: str(r.currency),
        datum: str(r.booking_date),
        stav: sparovany
          ? { text: "Spárovaný", ton: "uspech" }
          : suma != null && suma < 0
            ? { text: "pohyb::Výdaj", ton: "neutralny" }
            : { text: "pohyb::Príjem", ton: "informacia" },
        odkaz: r.bank_account_id
          ? { to: "/bankove-ucty/transakcie", search: { account: String(r.bank_account_id) } }
          : { to: "/bankove-ucty/transakcie" },
      };
    }
    case "zakazky":
      return {
        skupina: s,
        id,
        cislo: [str(r.job_number), str(r.name)].filter(Boolean).join(" · ") || null,
        partner: str(r.customer_name),
        suma: null,
        mena: null,
        datum: str(r.start_date) ?? (str(r.created_at)?.slice(0, 10) || null),
        stav: STAV_ZAKAZKY[String(r.status)] ?? null,
        odkaz: { to: "/zakazky/$id", params: { id } },
      };
  }
}

const alnum = (s: string | null | undefined) => normalizuj(s).replace(/ /g, "");

/**
 * Ako dobre riadok sedí na dotaz — presné číslo dokladu hore, potom začiatok
 * čísla, potom meno partnera. Pri zhode rozhoduje dátum (najnovšie hore).
 */
export function skoreVysledku(v: VysledokHladania, text: string): number {
  const q = alnum(text);
  if (!q) return 0;
  const c = alnum(v.cislo);
  if (c && c === q) return 4;
  if (c && c.startsWith(q)) return 3;
  if (v.ico && v.ico.replace(/\D/g, "") === q) return 3;
  if (sedyNazov(text, v.cislo) || sedyNazov(text, v.partner)) return 2;
  if (c && c.includes(q)) return 1;
  return 0;
}

export function zoradVysledky(polozky: VysledokHladania[], text: string): VysledokHladania[] {
  return polozky
    .map((v, i) => ({ v, i, s: skoreVysledku(v, text) }))
    .sort(
      (a, b) =>
        b.s - a.s ||
        String(b.v.datum ?? "").localeCompare(String(a.v.datum ?? "")) ||
        a.i - b.i,
    )
    .map((x) => x.v);
}

/** Zoznam „Zobraziť všetky“ — len kde zoznam hľadanie z adresy (`q`) naozaj použije. */
export function odkazVsetky(s: SkupinaHladania, text: string): Navigacia | null {
  const q = upravDotaz(text).slice(0, 80);
  if (!q) return null;
  switch (s) {
    case "vystavene":
      return { to: "/faktury", search: { q } };
    case "prijate":
      return { to: "/prijate-faktury", search: { q } };
    case "blocky":
      return { to: "/doklady", search: { stav: "vsetky", q } };
    case "nespracovane":
      return { to: "/nespracovane", search: { q } };
    case "kontakty":
      return { to: "/odberatelia", search: { q } };
    case "ponuky":
      return { to: "/ponuky", search: { q } };
    case "zakazky":
      return { to: "/zakazky", search: { q } };
    case "banka":
      // Pohyby hľadanie z adresy nepoznajú — počet sa ukáže bez odkazu.
      return null;
  }
}

/** Skupiny v pevnom poradí, bez prázdnych. */
export function zoskupVysledky(
  skupiny: { skupina: SkupinaHladania; pocet: number; riadky: VysledokHladania[] }[],
  text: string,
): SkupinaVysledkov[] {
  return PORADIE_SKUPIN.flatMap((s) => {
    const g = skupiny.find((x) => x.skupina === s);
    if (!g || !g.riadky.length) return [];
    return [
      {
        skupina: s,
        pocet: Math.max(g.pocet, g.riadky.length),
        polozky: zoradVysledky(g.riadky, text).slice(0, NA_SKUPINU),
        vsetky: odkazVsetky(s, text),
      },
    ];
  });
}
