/**
 * Kurz pri zakladaní dokladu v cudzej mene — čistá časť.
 *
 * Faktúra vystavená vo Fakteri si kurz dopočíta hneď po uložení
 * (`prepocitajFakturuFn`). Importy (SuperFaktúra, Pohoda, prijaté doklady,
 * API) a bločky to nerobili, takže doklad v cudzej mene ostal bez kurzu a
 * exporty ho buď vynechali, alebo poslali s `kurz: null`. Kurz sa preto
 * dopĺňa už do vkladaného riadku — po vložení by úprava prešla spúšťačmi
 * histórie a zámku zbytočne.
 */

import { domacaMena, naDomacu, type KrajinaKurzu, type ZdrojKurzu } from "./kurzy";

export type TabulkaKurzu = "invoices" | "purchase_invoices" | "expense_documents";

type Riadok = Record<string, any>;

/** Mena, deň dodania a sumy dokladu, z ktorých sa kurz počíta. */
export function udajeNaKurz(
  tabulka: TabulkaKurzu,
  r: Riadok,
): { mena: string; datum: string; zaklad: number; dan: number; celkom: number } {
  const mena = String(r?.currency ?? "")
    .trim()
    .toUpperCase();
  if (tabulka === "invoices")
    return {
      mena,
      datum: String(r?.delivery_date || r?.issue_date || ""),
      zaklad: Number(r?.subtotal ?? 0),
      dan: Number(r?.vat_total ?? 0),
      celkom: Number(r?.total ?? 0),
    };
  if (tabulka === "purchase_invoices")
    return {
      mena,
      datum: String(r?.delivery_date || r?.issue_date || ""),
      zaklad: Number(r?.amount_without_vat ?? 0),
      dan: Number(r?.vat_amount ?? 0),
      celkom: Number(r?.amount_total ?? 0),
    };
  // Bloček: deň dodania je deň nákupu.
  return {
    mena,
    datum: String(r?.issue_date || ""),
    zaklad: Number(r?.net_amount ?? 0),
    dan: Number(r?.vat_amount ?? 0),
    celkom: Number(r?.total_amount ?? 0),
  };
}

/** Treba kurz? Len cudzia mena, známy dátum a doklad, ktorý kurz ešte nemá. */
export function potrebujeKurz(tabulka: TabulkaKurzu, r: Riadok, krajina: KrajinaKurzu): boolean {
  if (Number(r?.exchange_rate) > 0) return false;
  const { mena, datum } = udajeNaKurz(tabulka, r);
  return (
    /^[A-Z]{3}$/.test(mena) && mena !== domacaMena(krajina) && /^\d{4}-\d{2}-\d{2}/.test(datum)
  );
}

/** Stĺpce kurzu pre danú tabuľku (každá ich má inak pomenované). */
export function stlpceKurzu(
  tabulka: TabulkaKurzu,
  r: Riadok,
  k: { kurz: number; den: string; zdroj: ZdrojKurzu },
  krajina: KrajinaKurzu,
): Riadok {
  const s = udajeNaKurz(tabulka, r);
  const dom = (x: number) => naDomacu(x, k.kurz, krajina);
  if (tabulka === "invoices")
    return {
      exchange_rate: k.kurz,
      exchange_rate_date: k.den,
      exchange_rate_source: k.zdroj,
      subtotal_eur: dom(s.zaklad),
      vat_total_eur: dom(s.dan),
      total_eur: dom(s.celkom),
    };
  if (tabulka === "purchase_invoices")
    return {
      exchange_rate: k.kurz,
      exchange_rate_source: k.zdroj,
      amount_without_vat_eur: dom(s.zaklad),
      vat_amount_eur: dom(s.dan),
    };
  return { exchange_rate: k.kurz, exchange_rate_date: k.den, exchange_rate_source: k.zdroj };
}

/**
 * Zmenila úprava bločku menu alebo deň nákupu? Vtedy pôvodný kurz neplatí —
 * bloček prepísaný z EUR na CZK by inak ostal bez kurzu a s inou menou či
 * dňom by niesol kurz iného dňa. Kurz zadaný v tej istej úprave má prednosť.
 */
export function kurzTrebaPrepocitat(povodny: Riadok | null | undefined, patch: Riadok): boolean {
  if (!povodny || !patch) return false;
  if ("exchange_rate" in patch) return false;
  const mena = (x: unknown) =>
    String(x ?? "")
      .trim()
      .toUpperCase();
  const den = (x: unknown) => String(x ?? "").slice(0, 10);
  const zmenaMeny = "currency" in patch && mena(patch.currency) !== mena(povodny.currency);
  const zmenaDna = "issue_date" in patch && den(patch.issue_date) !== den(povodny.issue_date);
  return zmenaMeny || zmenaDna;
}
