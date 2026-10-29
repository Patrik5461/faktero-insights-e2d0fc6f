/*
  E-mailové šablóny pre odosielanie dokladov (tabuľka `email_sablony`).

  Firma si môže založiť viac šablón — podľa typu dokladu (faktúra, zálohová,
  dobropis, ťarchopis, upomienka, ponuka…) a jazyka (SK, CZ, DE, EN, HU).
  Pri odoslaní sa vyberie tá, ktorá na doklad sedí najlepšie: presný typ má
  prednosť pred „všetkými faktúrami“, presný jazyk pred „všetkými jazykmi“.
  V okne odoslania sa dá vybrať iná.

  Premenné sa píšu v hranatých zátvorkách — [CISLO_FAKTURY], [SUMA]… Staršie
  {{invoice_number}} doplní ďalej `applyVars` v email.server.
*/
import { sumaNaZobrazenie } from "./dobropis-zobrazenie";
import { vsVystavenej } from "@/lib/faktero/variabilny-symbol";
import { datumNaDoklade, jazykDokladu, localeDokladu, type JazykDokladu } from "./faktura-jazyk";
import { formatujMenu } from "./mena";
import type { KrajinaDane } from "./vat-rates";

export const TYPY_SABLON = [
  "vsetky",
  "regular",
  "proforma",
  "advance_payment",
  "credit_note",
  "debit_note",
  "upomienka",
  "ponuka",
] as const;
export type TypSablony = (typeof TYPY_SABLON)[number];

/** Názvy typov (slovensky; na obrazovke cez `t()`). */
export const NAZVY_TYPOV_SABLON: Record<TypSablony, string> = {
  vsetky: "Všetky faktúry",
  regular: "Faktúra",
  proforma: "Zálohová faktúra",
  advance_payment: "Daňový doklad k prijatej platbe",
  credit_note: "Dobropis",
  debit_note: "Ťarchopis",
  upomienka: "Upomienka",
  ponuka: "Cenová ponuka",
};

export const JAZYKY_SABLON = ["vsetky", "sk", "cs", "de", "en", "hu"] as const;
export type JazykSablony = (typeof JAZYKY_SABLON)[number];

export const NAZVY_JAZYKOV_SABLON: Record<JazykSablony, string> = {
  vsetky: "Všetky jazyky",
  sk: "Slovenčina",
  cs: "Čeština",
  de: "Nemčina",
  en: "Angličtina",
  hu: "Maďarčina",
};

/** Premenné, ktoré šablóna pozná (slovenský popis na obrazovke cez `t()`). */
export const PREMENNE_SABLON: Array<{ kod: string; popis: string }> = [
  { kod: "[TYP_FAKTURY]", popis: "Druh dokladu v jazyku dokladu (Faktúra, Dobropis…)" },
  { kod: "[CISLO_FAKTURY]", popis: "Číslo dokladu" },
  { kod: "[SUMA]", popis: "Suma na úhradu s menou" },
  { kod: "[SPLATNOST]", popis: "Dátum splatnosti (pri ponuke platnosť)" },
  { kod: "[DATUM_VYSTAVENIA]", popis: "Dátum vystavenia" },
  { kod: "[VS]", popis: "Variabilný symbol" },
  { kod: "[ODBERATEL]", popis: "Názov odberateľa" },
  { kod: "[FIRMA]", popis: "Názov vašej firmy" },
  { kod: "[IBAN]", popis: "IBAN na úhradu" },
  { kod: "[CISLO_OBJEDNAVKY]", popis: "Číslo objednávky odberateľa" },
];

export type EmailSablona = {
  id: string;
  nazov: string;
  typ_dokladu: string;
  jazyk: string;
  predmet: string;
  text: string;
};

/** Typy, na ktoré sa šablóna „všetky faktúry“ vzťahuje — upomienka a ponuka nie. */
const TYPY_FAKTUR = new Set([
  "regular",
  "proforma",
  "advance_payment",
  "credit_note",
  "debit_note",
]);

/** Typ dokladu pre šablóny — neznámy typ faktúry je bežná faktúra. */
export function typPreSablonu(typ: string | null | undefined): TypSablony {
  if (typ === "upomienka" || typ === "ponuka") return typ;
  return typ && TYPY_FAKTUR.has(typ) ? (typ as TypSablony) : "regular";
}

/**
 * Body zhody šablóny s dokladom, `null` = nehodí sa. Presný typ (2) váži
 * viac než presný jazyk (1).
 */
export function zhodaSablony(
  s: Pick<EmailSablona, "typ_dokladu" | "jazyk">,
  typ: string | null | undefined,
  jazyk: string | null | undefined,
): number | null {
  const tp = typPreSablonu(typ);
  let body = 0;
  if (s.typ_dokladu === tp) body += 2;
  else if (!(s.typ_dokladu === "vsetky" && TYPY_FAKTUR.has(tp))) return null;
  const j = jazyk ? jazykDokladu(jazyk) : null;
  if (j && s.jazyk === j) body += 1;
  else if (s.jazyk !== "vsetky") return null;
  return body;
}

/** Šablóny použiteľné pre doklad, najlepšia prvá (pri zhode podľa názvu). */
export function sablonyPreDoklad<T extends EmailSablona>(
  sablony: T[],
  typ: string | null | undefined,
  jazyk: string | null | undefined,
): T[] {
  return sablony
    .map((s) => ({ s, b: zhodaSablony(s, typ, jazyk) }))
    .filter((x): x is { s: T; b: number } => x.b !== null)
    .sort((a, b) => b.b - a.b || a.s.nazov.localeCompare(b.s.nazov, "sk"))
    .map((x) => x.s);
}

/** Najlepšia šablóna pre doklad, alebo `null`. */
export function vyberSablonu<T extends EmailSablona>(
  sablony: T[],
  typ: string | null | undefined,
  jazyk: string | null | undefined,
): T | null {
  return sablonyPreDoklad(sablony, typ, jazyk)[0] ?? null;
}

/** Druh dokladu v jazyku dokladu — pre [TYP_FAKTURY]. */
const NAZOV_DOKLADU: Record<JazykDokladu, Record<TypSablony, string>> = {
  sk: {
    vsetky: "Faktúra",
    regular: "Faktúra",
    proforma: "Zálohová faktúra",
    advance_payment: "Daňový doklad k prijatej platbe",
    credit_note: "Dobropis",
    debit_note: "Ťarchopis",
    upomienka: "Upomienka",
    ponuka: "Cenová ponuka",
  },
  cs: {
    vsetky: "Faktura",
    regular: "Faktura",
    proforma: "Zálohová faktura",
    advance_payment: "Daňový doklad k přijaté platbě",
    credit_note: "Dobropis",
    debit_note: "Vrubopis",
    upomienka: "Upomínka",
    ponuka: "Cenová nabídka",
  },
  de: {
    vsetky: "Rechnung",
    regular: "Rechnung",
    proforma: "Proformarechnung",
    advance_payment: "Anzahlungsrechnung",
    credit_note: "Gutschrift",
    debit_note: "Belastungsanzeige",
    upomienka: "Zahlungserinnerung",
    ponuka: "Angebot",
  },
  en: {
    vsetky: "Invoice",
    regular: "Invoice",
    proforma: "Proforma invoice",
    advance_payment: "Advance payment invoice",
    credit_note: "Credit note",
    debit_note: "Debit note",
    upomienka: "Payment reminder",
    ponuka: "Quotation",
  },
  hu: {
    vsetky: "Számla",
    regular: "Számla",
    proforma: "Díjbekérő",
    advance_payment: "Előlegszámla",
    credit_note: "Jóváíró számla",
    debit_note: "Terhelési értesítő",
    upomienka: "Fizetési felszólítás",
    ponuka: "Árajánlat",
  },
};

export function nazovDruhuDokladu(
  typ: string | null | undefined,
  jazyk: unknown,
  krajina?: KrajinaDane | null,
): string {
  const j = jazykDokladu(jazyk);
  const tp = typPreSablonu(typ);
  // Nemecká firma: „Gutschrift“ je v Nemecku samofaktúra, opravná faktúra je „Rechnungskorrektur“.
  if (j === "de" && tp === "credit_note" && krajina === "DE") return "Rechnungskorrektur";
  return NAZOV_DOKLADU[j][tp];
}

export type DokladPreSablonu = {
  type?: string | null;
  invoice_number?: string | null;
  total?: unknown;
  currency?: string | null;
  due_date?: string | null;
  issue_date?: string | null;
  variable_symbol?: string | null;
  customer_name?: string | null;
  order_number?: string | null;
  oprava_25a?: boolean | null;
};

/** Hodnoty premenných v zvyklostiach jazyka dokladu. */
export function hodnotyPremennych(args: {
  doklad: DokladPreSablonu;
  /** `upomienka`/`ponuka`, inak typ faktúry z dokladu. */
  typ?: string | null;
  jazyk: unknown;
  firma?: string | null;
  iban?: string | null;
  krajina?: KrajinaDane | null;
}): Record<string, string> {
  const d = args.doklad;
  const typ = args.typ ?? d.type ?? "regular";
  return {
    TYP_FAKTURY: nazovDruhuDokladu(typ, args.jazyk, args.krajina),
    CISLO_FAKTURY: d.invoice_number ?? "",
    // Dobropis je v databáze záporný, v maili sa píše bez mínusu.
    SUMA:
      d.total == null || d.total === ""
        ? ""
        : formatujMenu(
            sumaNaZobrazenie(d, d.total),
            d.currency ?? "EUR",
            localeDokladu(args.jazyk),
          ),
    SPLATNOST: d.due_date ? datumNaDoklade(d.due_date, args.jazyk) : "",
    DATUM_VYSTAVENIA: d.issue_date ? datumNaDoklade(d.issue_date, args.jazyk) : "",
    VS: vsVystavenej(d),
    ODBERATEL: d.customer_name ?? "",
    FIRMA: args.firma ?? "",
    IBAN: args.iban ?? "",
    CISLO_OBJEDNAVKY: d.order_number ?? "",
  };
}

/** Doplní [PREMENNE] (bez ohľadu na veľkosť písmen); neznáme nechá tak. */
export function doplnPremenne(text: string, hodnoty: Record<string, string>): string {
  return text.replace(/\[([A-Za-z_]+)\]/g, (cele, kod: string) => {
    const k = kod.toUpperCase();
    return Object.prototype.hasOwnProperty.call(hodnoty, k) ? hodnoty[k]! : cele;
  });
}

/** Ukážkové hodnoty pre náhľad šablóny v Nastaveniach. */
export function ukazkoveHodnoty(
  jazyk: unknown,
  typ: string,
  firma: string,
): Record<string, string> {
  const j = jazyk === "vsetky" ? "sk" : jazyk;
  return hodnotyPremennych({
    doklad: {
      type: typ === "vsetky" ? "regular" : typ,
      invoice_number: "2026001",
      total: typ === "credit_note" ? -123.45 : 123.45,
      currency: "EUR",
      due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      issue_date: new Date().toISOString().slice(0, 10),
      variable_symbol: "2026001",
      customer_name: "Ukážka s.r.o.",
      order_number: "OBJ-15",
    },
    typ: typ === "vsetky" ? "regular" : typ,
    jazyk: j,
    firma,
    iban: "SK31 1200 0000 1987 4263 7541",
  });
}
