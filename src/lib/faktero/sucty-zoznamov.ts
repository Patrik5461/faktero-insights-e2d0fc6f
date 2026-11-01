/*
  Súčtové karty zoznamov (prijaté faktúry, prijaté zálohové, bločky) — čo sa
  do ktorej karty počíta. Meny sa nikdy nesčítavajú: výsledkom je vždy
  `Map<mena, suma>` zo `sucetPoMenach` (domáca mena prvá), ktorú zobrazí
  `<SuctyPoMenach>`. Rozhodnutie 1. 11. 2026 — v zoznamoch súčty po menách.
*/
import { sucetPoMenach } from "./mena-sucet";

type Suma = number | string | null | undefined;

/**
 * Karta „Celková suma“ prijatých faktúr: rovnaké pravidlá ako pätička
 * zoznamu — koncept, storno, zálohová a samofaktúra, ktorú dodávateľ ešte
 * neodsúhlasil, sa nepočítajú. Dobropis je v databáze záporný, odpočíta sa sám.
 */
export function celkomPrijatychPoMenach<
  T extends {
    status?: string | null;
    type?: string | null;
    amount_total?: Suma;
    currency?: string | null;
  },
>(riadky: readonly T[], zapocitatelna: (r: T) => boolean, domaca = "EUR"): Map<string, number> {
  const doSuctu = riadky.filter(
    (r) =>
      r.status !== "draft" && r.status !== "cancelled" && r.type !== "proforma" && zapocitatelna(r),
  );
  return sucetPoMenach(
    doSuctu,
    (r) => Number(r.amount_total ?? 0),
    (r) => r.currency,
    domaca,
  );
}

/**
 * Karty prijatých zálohových faktúr. „Celková suma“ bez storna; „Nezaplatené“
 * len tie, ktoré ešte čakajú na úhradu — zaplatená ani zúčtovaná ostrou
 * faktúrou (rovnako ako odznak stavu) už dlhom nie je.
 */
export function suctyPrijatychZaloh<
  T extends {
    id: string;
    status?: string | null;
    amount_total?: Suma;
    currency?: string | null;
    payment_date?: string | null;
  },
>(
  riadky: readonly T[],
  zuctovane: Record<string, string | undefined>,
  domaca = "EUR",
): { spolu: Map<string, number>; nezaplatene: Map<string, number> } {
  const platne = riadky.filter((r) => r.status !== "cancelled");
  const cakaju = platne.filter((r) => !r.payment_date && !zuctovane[r.id]);
  const suma = (r: T) => Number(r.amount_total ?? 0);
  const mena = (r: T) => r.currency;
  return {
    spolu: sucetPoMenach(platne, suma, mena, domaca),
    nezaplatene: sucetPoMenach(cakaju, suma, mena, domaca),
  };
}

/** Karty bločkov (základ, DPH, celkom) po menách. */
export function suctyBlockovPoMenach<
  T extends { net_amount?: Suma; vat_amount?: Suma; total_amount?: Suma; currency?: string | null },
>(riadky: readonly T[], domaca = "EUR") {
  const mena = (r: T) => r.currency;
  return {
    net: sucetPoMenach(riadky, (r) => Number(r.net_amount ?? 0), mena, domaca),
    vat: sucetPoMenach(riadky, (r) => Number(r.vat_amount ?? 0), mena, domaca),
    total: sucetPoMenach(riadky, (r) => Number(r.total_amount ?? 0), mena, domaca),
  };
}
