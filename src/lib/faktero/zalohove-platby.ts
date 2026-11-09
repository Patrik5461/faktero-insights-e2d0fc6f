import { stavPlatby, type StavPlatby } from "./stav-platby";

/**
 * Stav platby zálohových faktúr (vydaných aj prijatých) v zozname a detaile.
 *
 * Vlastné párovanie zálohovky nemajú — berú návrhy z existujúcich párovaní:
 *
 * - **vydaná zálohová** (`invoices`, type proforma) = prichádzajúca platba,
 *   návrhy z `navrhniParovanie` (`parovanie.ts`, podľa VS/čísla a sumy),
 * - **prijatá zálohová** (`purchase_invoices`, type proforma) = odchádzajúca
 *   platba, návrhy z `navrhniParovaniePrijatych` (`prijata-parovanie.ts`,
 *   podľa sumy na cent a VS / účtu / mena dodávateľa).
 *
 * Tu sú len čisté pomôcky: zjednotenie tvaru návrhu z oboch strán, výber
 * návrhu k dokladu a stav pre ikonku a filter „Platba“.
 */

export type DruhZalohy = "vydana" | "prijata";

/** Hodnota filtra „Platba“ v zoznamoch zálohových faktúr (v adrese ako `platba`). */
export type FilterPlatbyZalohy = "uhradene" | "navrh" | "bez";

export const MOZNOSTI_FILTRA_PLATBY: { value: FilterPlatbyZalohy; label: string }[] = [
  { value: "uhradene", label: "Uhradené" },
  { value: "navrh", label: "S nájdenou platbou" },
  { value: "bez", label: "Bez platby" },
];

export function jeFilterPlatby(v: string | null | undefined): v is FilterPlatbyZalohy {
  return v === "uhradene" || v === "navrh" || v === "bez";
}

/** Spôsoby úhrady, ktoré sa na účte neobjavia (nie je čo hľadať). */
const NA_MIESTE: Record<DruhZalohy, Set<string>> = {
  vydana: new Set(["cash", "card"]),
  prijata: new Set(["hotovost", "karta", "dobierka", "zapocet"]),
};

export type ZalohaPreStav = {
  status: string | null;
  payment_method?: string | null;
  payment_date?: string | null;
  deleted_at?: string | null;
};

/** Je zálohová uhradená (stav, pri prijatej aj vyplnený dátum úhrady)? */
export function zalohaUhradena(r: ZalohaPreStav, druh: DruhZalohy): boolean {
  return r.status === "paid" || (druh === "prijata" && !!r.payment_date);
}

/** Stav ikonky banky pri zálohovej — tie isté pravidlá ako pri prijatých faktúrach. */
export function stavPlatbyZalohy(
  r: ZalohaPreStav,
  druh: DruhZalohy,
  d: { sparovana: boolean; maNavrh: boolean },
): StavPlatby | null {
  return stavPlatby({
    sparovana: d.sparovana,
    maNavrh: d.maNavrh,
    platiSaPrevodom: !r.payment_method || !NA_MIESTE[druh].has(r.payment_method),
    uhradena: zalohaUhradena(r, druh),
    aktivna: r.status !== "draft" && r.status !== "cancelled" && !r.deleted_at,
  });
}

/** Patrí riadok do filtra „Platba“? Prázdny filter púšťa všetko. */
export function sediFiltruPlatby(
  filter: FilterPlatbyZalohy | "" | null | undefined,
  uhradena: boolean,
  stav: StavPlatby | null,
): boolean {
  if (!filter) return true;
  if (filter === "uhradene") return uhradena || stav === "sparovana";
  if (filter === "navrh") return stav === "navrh";
  return stav === "nenajdena";
}

/** Pohyb z účtu, ktorý návrh ponúka. */
export type PohybNavrhu = {
  booking_date: string;
  amount: number;
  currency: string | null;
  variable_symbol: string | null;
  counterparty: string | null;
};

/** Návrh spárovania zálohovej v jednom tvare pre obe strany. */
export type NavrhPlatbyZalohy = {
  dokladId: string;
  transactionId: string;
  /** Koľko sa zapíše ako úhrada (vydaná vie aj čiastočnú; prijatá celú sumu pohybu). */
  suma: number;
  istota: "auto" | "navrh";
  dovody: string[];
  pohyb: PohybNavrhu | null;
};

/**
 * Výsledok `navrhniParovanie` (vydané) → návrhy k zálohovým. Párovanie beží
 * cez všetky otvorené faktúry naraz (pohyb sa nerozdelí dvakrát), tu sa
 * nechajú len zálohové — keď návrh druh nenesie, rozhodne zoznam `ids`.
 */
export function navrhyZVydanych(
  r: { auto?: any[]; navrhy?: any[] } | null | undefined,
  ids?: Set<string>,
): NavrhPlatbyZalohy[] {
  const vsetky = [...(r?.auto ?? []), ...(r?.navrhy ?? [])];
  return vsetky
    .filter((z) => z?.invoiceId && z?.transactionId)
    .filter((z) => (ids ? ids.has(z.invoiceId) : !z.faktura?.type || z.faktura.type === "proforma"))
    .map((z) => ({
      dokladId: String(z.invoiceId),
      transactionId: String(z.transactionId),
      suma: Number(z.suma ?? z.transakcia?.amount ?? 0),
      istota: z.istota === "auto" ? "auto" : "navrh",
      dovody: Array.isArray(z.dovody) ? z.dovody : [],
      pohyb: z.transakcia
        ? {
            booking_date: z.transakcia.booking_date,
            amount: Number(z.transakcia.amount),
            currency: z.transakcia.currency ?? null,
            variable_symbol: z.transakcia.variable_symbol ?? null,
            counterparty: z.transakcia.counterparty ?? null,
          }
        : null,
    }));
}

/** Výsledok `navrhniParovaniePrijatych` → návrhy k zálohovým zo zoznamu `ids`. */
export function navrhyZPrijatych(
  zhody: any[] | null | undefined,
  ids?: Set<string>,
): NavrhPlatbyZalohy[] {
  return (zhody ?? [])
    .filter((z) => z?.purchaseInvoiceId && z?.transactionId && (!ids || ids.has(z.purchaseInvoiceId)))
    .map((z) => ({
      dokladId: String(z.purchaseInvoiceId),
      transactionId: String(z.transactionId),
      suma: Math.abs(Number(z.pohyb?.amount ?? 0)),
      istota: z.istota === "auto" ? "auto" : "navrh",
      dovody: Array.isArray(z.dovody) ? z.dovody : [],
      pohyb: z.pohyb
        ? {
            booking_date: z.pohyb.booking_date,
            amount: Number(z.pohyb.amount),
            currency: z.pohyb.currency ?? null,
            variable_symbol: z.pohyb.variable_symbol ?? null,
            counterparty: z.pohyb.counterparty ?? null,
          }
        : null,
    }));
}

/** Návrh ku každému dokladu — pri viacerých pohyboch na jeden doklad vyhráva istý. */
export function navrhPodlaDokladu(navrhy: NavrhPlatbyZalohy[]): Map<string, NavrhPlatbyZalohy> {
  const m = new Map<string, NavrhPlatbyZalohy>();
  for (const z of navrhy) {
    const doteraz = m.get(z.dokladId);
    if (!doteraz || (doteraz.istota !== "auto" && z.istota === "auto")) m.set(z.dokladId, z);
  }
  return m;
}
