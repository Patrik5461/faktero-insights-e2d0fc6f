/*
  Verejné API — pracovné značky dokladov (vlastný stav, štítky, komentár,
  účtovná poznámka), úhrady prijatých faktúr, vybavenie bankových pohybov
  a zámok odovzdaných dokladov. Čisté pravidlá bez databázy, aby sa dali
  otestovať; zápis je v `api-evidencia.server.ts` a `api-zapis.server.ts`.
*/
import { z } from "zod";
import { MAX_STITKOV } from "./doklady-hromadne";
import { stavUhradyPrijatej, type UhradaPrijatej } from "./uhrady-prijatej";

export const DATUM_API = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dátum v tvare RRRR-MM-DD");

/* ---------------- stav, štítky, komentár, účtovná poznámka ---------------- */

/**
 * Pracovné značky na doklade. `stav_id` alebo `stav` (názov z číselníka
 * stavov firmy); `null` značku zruší. `stitky` nahradia celý zoznam,
 * `stitky_pridat` / `stitky_odobrat` menia len jeden štítok.
 */
export const ZnackyVstup = z.object({
  stav_id: z.string().uuid().nullish(),
  stav: z.string().trim().max(60).nullish(),
  stitky: z.array(z.string().max(200)).max(20).optional(),
  stitky_pridat: z.string().trim().min(1).max(40).optional(),
  stitky_odobrat: z.string().trim().min(1).max(40).optional(),
  /** Komentár pre ľudí vo firme — do účtovníctva (Pohoda, exporty) nejde nikdy. */
  komentar: z.string().max(1000).nullish(),
  /** Účtovná poznámka — ide s dokladom do účtovníctva. */
  int_poznamka: z.string().max(2000).nullish(),
});
export type ZnackyVstupT = z.infer<typeof ZnackyVstup>;

/** Štítky bez prázdnych a duplicít (bez ohľadu na veľkosť písmen), najviac 40 znakov. */
export function normalizujStitky(
  vstup: string[],
): { ok: true; stitky: string[] } | { ok: false; sprava: string } {
  const out: string[] = [];
  for (const s of vstup) {
    const t = String(s ?? "")
      .trim()
      .slice(0, 40);
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  if (out.length > MAX_STITKOV)
    return { ok: false, sprava: `Doklad môže mať najviac ${MAX_STITKOV} štítkov.` };
  return { ok: true, stitky: out };
}

/** Štítky po pridaní / odobratí jedného (na pôvodnom zozname dokladu). */
export function stitkyPoZmene(
  povodne: string[] | null | undefined,
  pridat?: string,
  odobrat?: string,
): { ok: true; stitky: string[] } | { ok: false; sprava: string } {
  let s = (povodne ?? []).filter(Boolean);
  const o = odobrat?.trim().toLowerCase();
  if (o) s = s.filter((x) => x.toLowerCase() !== o);
  const p = pridat?.trim().slice(0, 40);
  if (p && !s.some((x) => x.toLowerCase() === p.toLowerCase())) s = [...s, p];
  return normalizujStitky(s);
}

/** Je vo vstupe niečo zo značiek? (stav sa rieši zvlášť, potrebuje číselník.) */
export function maZnacky(v: ZnackyVstupT): boolean {
  return (
    v.stav_id !== undefined ||
    v.stav !== undefined ||
    v.stitky !== undefined ||
    v.stitky_pridat !== undefined ||
    v.stitky_odobrat !== undefined ||
    v.komentar !== undefined ||
    v.int_poznamka !== undefined
  );
}

/** Prázdny text = zmazať (null), inak orezaný text. */
const textAleboNull = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : v.trim() || null;

/** Komentár a účtovná poznámka do riadku dokladu (stav a štítky dopĺňa server). */
export function textyZnaciek(v: ZnackyVstupT): Record<string, string | null> {
  const r: Record<string, string | null> = {};
  const k = textAleboNull(v.komentar);
  const p = textAleboNull(v.int_poznamka);
  if (k !== undefined) r.komentar = k;
  if (p !== undefined) r.int_poznamka = p;
  return r;
}

/* ---------------- zámok odovzdaných dokladov ---------------- */

export type TabulkaDokladu = "invoices" | "purchase_invoices" | "expense_documents";

/*
  Stĺpce, ktoré sa na odovzdanom (a pri prijatých a bločkoch aj zamknutom)
  doklade nemenia. Zhodné so zoznamom v spúšťačoch `*_zamok_odovzdania` —
  tie však servisný kľúč (API) púšťajú, preto to isté stráži API. Navyše
  účtovná poznámka, ako v aplikácii (doklady-hromadne.ts). Pracovné značky
  (stav, štítky, komentár) a úhrada zámok nepoznajú.
*/
export const ZAMKNUTE_STLPCE: Record<TabulkaDokladu, readonly string[]> = {
  invoices: [
    "type",
    "invoice_number",
    "number_series_id",
    "sequence_number",
    "variable_symbol",
    "constant_symbol",
    "specific_symbol",
    "order_number",
    "issue_date",
    "delivery_date",
    "due_date",
    "customer_id",
    "customer_name",
    "customer_street",
    "customer_city",
    "customer_zip",
    "customer_country",
    "customer_ico",
    "customer_dic",
    "customer_ic_dph",
    "customer_email",
    "subtotal",
    "vat_total",
    "total",
    "currency",
    "exchange_rate",
    "intro_note",
    "notes",
    "payment_method",
    "pohoda_predkontacia",
    "pohoda_clenenie_dph",
    "kv_clenenie",
    "stredisko",
    "cinnost",
    "int_poznamka",
  ],
  purchase_invoices: [
    "type",
    "invoice_number",
    "variable_symbol",
    "constant_symbol",
    "specific_symbol",
    "order_number",
    "delivery_note_number",
    "opravuje_cislo",
    "issue_date",
    "delivery_date",
    "due_date",
    "supplier_name",
    "supplier_ico",
    "supplier_dic",
    "supplier_ic_dph",
    "supplier_street",
    "supplier_city",
    "supplier_zip",
    "supplier_country",
    "supplier_iban",
    "amount_without_vat",
    "vat_amount",
    "amount_total",
    "items",
    "currency",
    "exchange_rate",
    "dph_rezim",
    "reverse_charge",
    "payment_method",
    "note",
    "pohoda_predkontacia",
    "pohoda_clenenie_dph",
    "kv_clenenie",
    "stredisko",
    "cinnost",
    "int_poznamka",
  ],
  expense_documents: [
    "supplier_name",
    "supplier_ico",
    "supplier_ic_dph",
    "document_number",
    "issue_date",
    "total_amount",
    "vat_amount",
    "net_amount",
    "vat_rate",
    "vat_breakdown",
    "items",
    "currency",
    "payment_method",
    "note",
    "pohoda_predkontacia",
    "pohoda_clenenie_dph",
    "kv_clenenie",
    "stredisko",
    "cinnost",
    "category",
    "int_poznamka",
  ],
};

/** Je doklad odovzdaný do účtovníctva alebo zamknutý? (vystavená faktúra len odovzdaná) */
export function dovodZamkuApi(
  tab: TabulkaDokladu,
  r: { exported_at?: string | null; locked_at?: string | null },
): "odovzdany" | "zamknuty" | null {
  if (r.exported_at) return "odovzdany";
  if (tab !== "invoices" && r.locked_at) return "zamknuty";
  return null;
}

const rovnake = (a: unknown, b: unknown) => {
  if ((a ?? null) === null && (b ?? null) === null) return true;
  if (typeof a === "number" || typeof b === "number") {
    const x = Number(a);
    const y = Number(b);
    if (Number.isFinite(x) && Number.isFinite(y)) return Math.abs(x - y) < 0.0001;
  }
  return JSON.stringify(a) === JSON.stringify(b);
};

/** Zamknuté stĺpce, ktoré by zmena naozaj zmenila (rovnaká hodnota zámok neporuší). */
export function zamknuteZmeny(
  tab: TabulkaDokladu,
  stary: Record<string, unknown>,
  zmena: Record<string, unknown>,
): string[] {
  return ZAMKNUTE_STLPCE[tab].filter((s) => s in zmena && !rovnake(stary[s], zmena[s]));
}

export const SPRAVA_ZAMKU = {
  odovzdany:
    "Doklad je odovzdaný do účtovníctva — najprv ho vráťte z Pohody (exported: false), potom ho upravte.",
  zamknuty: "Doklad je zamknutý — najprv ho v aplikácii odomknite.",
} as const;

/* ---------------- úhrady prijatých faktúr ---------------- */

export const UhradaVstup = z.object({
  /** Vlastné id integrátora — opakované volanie úhradu nezdvojí. */
  external_id: z.string().trim().min(1).max(120).nullish(),
  amount: z.number().positive().max(1_000_000_000),
  paid_at: DATUM_API.nullish(),
  method: z.string().max(20).nullish(),
  note: z.string().max(500).nullish(),
});

/** Spôsob úhrady prijatej faktúry (prevod / hotovost / karta), aj anglické kódy API. */
export function sposobUhradyPrijatej(v: string | null | undefined): string | null {
  const k = String(v ?? "")
    .trim()
    .toLowerCase();
  if (!k) return null;
  if (["prevod", "bank_transfer", "transfer"].includes(k)) return "prevod";
  if (["hotovost", "cash"].includes(k)) return "hotovost";
  if (["karta", "card", "credit_card"].includes(k)) return "karta";
  return null;
}

const ZDROJ_UHRADY: Record<string, string> = {
  rucne: "manual",
  banka: "bank",
  oznacenie: "marked_paid",
};

/** Riadok úhrady na odpoveď API. */
export function uhradaVystup(u: Record<string, any>) {
  return {
    objekt: "purchase_invoice_payment",
    id: u.id,
    external_id: u.external_id ?? null,
    amount: Number(u.amount),
    currency: u.currency ?? null,
    paid_at: u.paid_at,
    method: u.method ?? null,
    source: ZDROJ_UHRADY[String(u.zdroj)] ?? String(u.zdroj ?? "manual"),
    bank_transaction_id: u.bank_transaction_id ?? null,
    note: u.note ?? null,
    /** Úhradu z banky zruší len zrušenie spárovania pohybu. */
    deletable: !u.bank_transaction_id,
    created_at: u.created_at ?? null,
  };
}

const STAV_UHRADY_API = { uhradena: "paid", ciastocne: "partially_paid", neuhradena: "unpaid" };

/** Súhrn úhrad faktúry: koľko treba uhradiť, koľko je uhradené a stav. */
export function suhrnUhrad(
  faktura: {
    amount_total?: number | string | null;
    status?: string | null;
    currency?: string | null;
  },
  uhrady: UhradaPrijatej[],
  zaloha: number,
) {
  const s = stavUhradyPrijatej({
    amount_total: faktura.amount_total,
    status: faktura.status,
    uhrady,
    zaloha,
  });
  return {
    currency: faktura.currency ?? null,
    amount_total: s.celkom,
    advance_deducted: s.zaloha,
    amount_due: s.naUhradu,
    amount_paid: s.uhradene,
    amount_remaining: s.zostava,
    overpaid: s.preplatene,
    payment_status: STAV_UHRADY_API[s.stav],
  };
}

/* ---------------- vybavenie bankových pohybov ---------------- */

export const VybavenieVstup = z.object({
  /** bez_dokladu = pohyb nemá doklad, transakcna_dan = transakčná daň; null zruší. */
  resolution: z.enum(["bez_dokladu", "transakcna_dan"]).nullable(),
  note: z.string().max(200).nullish(),
});

export const STAVY_POHYBU = ["sparovany", "bez_dokladu", "transakcna_dan", "nesparovany"] as const;
export type StavPohybuApi = (typeof STAVY_POHYBU)[number];

/** Pohyb spárovaný s dokladom? (aj splátka a poplatok financovania) */
export function jeSparovany(
  p: {
    matched_invoice_id?: string | null;
    matched_purchase_invoice_id?: string | null;
    matched_expense_id?: string | null;
    matched_installment_id?: string | null;
  },
  poplatkov = 0,
): boolean {
  return Boolean(
    p.matched_invoice_id ||
    p.matched_purchase_invoice_id ||
    p.matched_expense_id ||
    p.matched_installment_id ||
    poplatkov > 0,
  );
}
