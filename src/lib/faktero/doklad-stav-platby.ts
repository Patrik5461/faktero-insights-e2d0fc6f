import { stavPlatby, type StavPlatby } from "./stav-platby";
import type { PohybPlatby } from "@/components/faktero/IkonaPlatby";

/**
 * Stav platby bločku / dokladu (`expense_documents`) pre ikonku v zozname.
 *
 * Ikonka patrí len dokladom plateným **prevodom**. Bloček zaplatený v
 * hotovosti sa v banke neobjaví a pri karte by červená bodka „nenašla sa“
 * strašila pri každom nákupe, kým banka platbu nezúčtuje — oba sú bez ikonky
 * (párovanie karty ostáva v stĺpci „Úhrada z účtu“ a v návrhoch nad zoznamom).
 *
 * Doklad nemá vlastný stav „uhradený“ — uhradený z účtu je práve vtedy, keď
 * ho uhrádza pohyb (`bank_transactions.matched_expense_id`).
 */
export type UhradaDokladuStav = {
  datum: string;
  transactionId: string;
  suma?: number | null;
  mena?: string | null;
  vs?: string | null;
  protistrana?: string | null;
  bankAccountId?: string | null;
  ucet?: string | null;
};

export type NavrhDokladu = {
  transactionId: string;
  expenseId: string;
  istota: "auto" | "navrh";
  dovody: string[];
  pohyb?: {
    booking_date?: string | null;
    amount?: number | string | null;
    currency?: string | null;
    variable_symbol?: string | null;
    counterparty?: string | null;
    bank_account_id?: string | null;
    ucet?: string | null;
  } | null;
};

export function stavPlatbyDokladu(
  r: { payment_method?: string | null; issue_date?: string | null; deleted_at?: string | null },
  k: {
    uhrada?: UhradaDokladuStav | null;
    navrh?: NavrhDokladu | null;
    /** Má firma aspoň jeden bankový účet? Bez neho niet kde platbu hľadať. */
    maUcet: boolean;
    /** Odkedy párovanie hľadá (server); starší doklad sa za nenájdený nehlási. */
    hladaneOd: string | null;
  },
): StavPlatby | null {
  if (r.payment_method !== "prevod") return null;
  const sparovana = !!k.uhrada;
  const vOkne = !!k.hladaneOd && !!r.issue_date && r.issue_date >= k.hladaneOd;
  return stavPlatby({
    sparovana,
    maNavrh: !!k.navrh,
    platiSaPrevodom: true,
    uhradena: sparovana,
    // „Nenájdená“ dáva zmysel len tam, kde sa naozaj hľadalo.
    aktivna: sparovana || (!r.deleted_at && k.maUcet && (vOkne || !!k.navrh)),
  });
}

/** Kam ručne: zoznam pohybov účtu (konkrétny pohyb nemá vlastnú adresu). */
export function odkazNaPohyb(bankAccountId?: string | null): string {
  return bankAccountId
    ? `/bankove-ucty/transakcie?account=${encodeURIComponent(bankAccountId)}`
    : "/bankove-ucty/transakcie";
}

export function pohybZUhrady(u: UhradaDokladuStav): PohybPlatby {
  return {
    datum: u.datum,
    suma: u.suma ?? null,
    mena: u.mena ?? null,
    ucet: u.ucet ?? null,
    vs: u.vs ?? null,
    protistrana: u.protistrana ?? null,
    odkaz: odkazNaPohyb(u.bankAccountId),
  };
}

export function pohybZNavrhu(z: NavrhDokladu): PohybPlatby | null {
  const p = z.pohyb;
  if (!p) return null;
  return {
    datum: p.booking_date ?? null,
    suma: p.amount == null ? null : Number(p.amount),
    mena: p.currency ?? null,
    ucet: p.ucet ?? null,
    vs: p.variable_symbol ?? null,
    protistrana: p.counterparty ?? null,
    odkaz: odkazNaPohyb(p.bank_account_id),
  };
}

/** Možnosti filtra „Platba“ v zozname dokladov (hodnota = `StavPlatby`). */
export const FILTER_STAVU_PLATBY: { value: StavPlatby; label: string }[] = [
  { value: "sparovana", label: "Spárovaná" },
  { value: "navrh", label: "Nájdená, čaká na potvrdenie" },
  { value: "nenajdena", label: "Nenájdená" },
];
