/*
  Bankový pohyb vybavený bez dokladu.

  Nie každý pohyb na účte má doklad: poplatok banky, mzda, odvod Sociálnej či
  zdravotnej poisťovni, transakčná daň (zákon 235/2024 Z. z., od 2025). Kým sa
  nedali označiť, svietili medzi nespárovanými navždy a účtovník ich musel
  v hlave preskakovať.

  Označenie ukladá stĺpec `bank_transactions.vybavenie`. Pri príchode pohybu ho
  nastaví spúšťač `faktero_vybav_novy_pohyb` (transakčnú daň podľa popisu banky,
  ostatné pravidlom „Spárované bez dokladu“); tu je to isté porovnanie pre
  obrazovku a testy — **pri zmene podmienok upraviť aj SQL funkcie**
  `faktero_je_transakcna_dan` a `faktero_pravidlo_bez_dokladu`.
*/
import { holyText, normVs, type Pravidlo } from "./pravidla-uctovania";

export type Vybavenie = "bez_dokladu" | "transakcna_dan";

export const VYBAVENIA: { kod: Vybavenie; nazov: string }[] = [
  { kod: "bez_dokladu", nazov: "Spárované bez dokladu" },
  { kod: "transakcna_dan", nazov: "Transakčná daň" },
];

export function nazovVybavenia(v: unknown): string | null {
  return VYBAVENIA.find((x) => x.kod === v)?.nazov ?? null;
}

/**
 * Banka sama nazvala pohyb transakčnou daňou? Tatra banka píše
 * „Transakčná daň 30.09.2026“, „Transakčná daň za transakcie“ či „… za použitie karty“.
 */
export function jeTransakcnaDan(
  popis: string | null | undefined,
  protistrana?: string | null,
): boolean {
  return /transakcn[a-z]*\s+dan|transaction\s+tax/.test(
    holyText(`${popis ?? ""} ${protistrana ?? ""}`),
  );
}

const normIban = (v: string | null | undefined) =>
  String(v ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
const prazdne = (v: string | null | undefined) => !String(v ?? "").trim();

export type PohybNaVybavenie = {
  suma: number;
  protiucet?: string | null;
  vs?: string | null;
  protistrana?: string | null;
  popis?: string | null;
};

/** Pravidlo „Spárované bez dokladu“ pre pohyb — zhodné s `faktero_pravidlo_bez_dokladu`. */
export function pravidloBezDokladu<T extends Pravidlo>(
  pravidla: T[],
  pohyb: PohybNaVybavenie,
  ucet: string | null | undefined,
): T | null {
  const podmienok = (p: Pravidlo) =>
    [p.bankovy_ucet, p.smer, p.iban_protistrany, p.variabilny_symbol, p.dodavatel_text].filter(
      (x) => !prazdne(x),
    ).length;
  const smer = pohyb.suma < 0 ? "vydaj" : "prijem";
  const text = holyText(`${pohyb.protistrana ?? ""} ${pohyb.popis ?? ""}`);
  return (
    pravidla
      .filter((p) => p.aktivne && p.druh === "banka" && p.bez_dokladu)
      .filter((p) => prazdne(p.oznacenie))
      .filter(
        (p) =>
          !prazdne(p.iban_protistrany) ||
          !prazdne(p.variabilny_symbol) ||
          !prazdne(p.dodavatel_text),
      )
      .filter((p) => prazdne(p.bankovy_ucet) || normIban(p.bankovy_ucet) === normIban(ucet))
      .filter((p) => !p.smer || p.smer === smer)
      .filter(
        (p) =>
          prazdne(p.iban_protistrany) || normIban(p.iban_protistrany) === normIban(pohyb.protiucet),
      )
      .filter(
        (p) =>
          prazdne(p.variabilny_symbol) ||
          (!!normVs(pohyb.vs) && normVs(p.variabilny_symbol) === normVs(pohyb.vs)),
      )
      .filter((p) => prazdne(p.dodavatel_text) || text.includes(holyText(p.dodavatel_text!.trim())))
      .sort((a, b) => a.poradie - b.poradie || podmienok(b) - podmienok(a))[0] ?? null
  );
}

export type StavPohybu = "sparovany" | Vybavenie | "nesparovany";

/** Pohyb tak, ako ho číta obrazovka — stĺpce z `bank_transactions`. */
export type PohybStav = {
  matched_invoice_id?: string | null;
  matched_purchase_invoice_id?: string | null;
  matched_expense_id?: string | null;
  matched_installment_id?: string | null;
  vybavenie?: string | null;
};

export function stavPohybu(p: PohybStav): StavPohybu {
  if (
    p.matched_invoice_id ||
    p.matched_purchase_invoice_id ||
    p.matched_expense_id ||
    p.matched_installment_id
  )
    return "sparovany";
  if (p.vybavenie === "bez_dokladu" || p.vybavenie === "transakcna_dan") return p.vybavenie;
  return "nesparovany";
}

/**
 * „Spolu X € z Y €“ — koľko z pohybu pokrývajú spárované doklady. Sumy sa
 * porovnávajú v absolútnej hodnote: výdaj je na účte záporný, doklad kladný.
 */
export function pokrytiePohybu(
  sumaPohybu: number,
  doklady: { suma: number }[],
): { spolu: number; z: number; zostava: number; uplne: boolean } {
  const z = Math.round(Math.abs(Number(sumaPohybu) || 0) * 100) / 100;
  const spolu =
    Math.round(doklady.reduce((s, d) => s + Math.abs(Number(d.suma) || 0), 0) * 100) / 100;
  const zostava = Math.round((z - spolu) * 100) / 100;
  return { spolu, z, zostava, uplne: Math.abs(zostava) < 0.005 };
}

/** Parametre odkazu „Vytvoriť pravidlo z tohto pohybu“ na stránku Pravidlá účtovania. */
export function hladaniePravidlaZPohybu(p: {
  suma: number;
  protistrana?: string | null;
  protiucet?: string | null;
  vs?: string | null;
}): Record<string, string | undefined> {
  const v = (x: string | null | undefined) => (prazdne(x) ? undefined : String(x).trim());
  const iban = normIban(p.protiucet);
  const platnyIban = /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban);
  return {
    novy: "banka",
    nazov: v(p.protistrana)?.slice(0, 120),
    smer: p.suma < 0 ? "vydaj" : "prijem",
    iban: platnyIban ? iban : undefined,
    bvs: normVs(p.vs) || undefined,
    // Bez IBAN-u a VS je protistrana jediné, podľa čoho pravidlo pohyb spozná.
    protistrana: !platnyIban && !normVs(p.vs) ? v(p.protistrana)?.slice(0, 120) : undefined,
  };
}
