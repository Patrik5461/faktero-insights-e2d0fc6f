/*
  Zaokrúhlenie bločku a kontrola jeho sumy.

  Pri platbe v hotovosti sa suma na úhradu zaokrúhľuje na 5 centov (najviac
  o 2 centy). eKasa bloček nesie zaokrúhlenie ako samostatnú položku
  („Zaokrúhlenie“, 0 %) a suma bločku je už po zaokrúhlení — rozpis DPH
  podľa sadzieb ho neobsahuje. Preto platí:

      základ + DPH + zaokrúhlenie = suma bločku

  Zaokrúhlenie sa nesie ako vlastná položka dokladu (bez DPH), aby sa nedalo
  pomýliť s položkou v sadzbe 0 % a aby rozdiel po ručnom prepísaní sumy
  nezmizol potichu „v zaokrúhlení“. Export do Pohody ho dá do `round`
  (priceRound), prípadne ako položku s predkontáciou zaokrúhlenia — nikdy
  nie ako položku v sadzbe 0 %.
*/

import { maxZaokruhlenie } from "./dph-pravidlo";

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Najväčšie zaokrúhlenie hotovosti na 5 centov. */
export const MAX_ZAOKRUHLENIE = 0.02;

/**
 * Najväčšie povolené zaokrúhlenie bločku (QA 13. 11. 2026: bloček prijal
 * zaokrúhlenie 0,80 € bez varovania). Hotovosť v eurách sa zaokrúhľuje na
 * 5 centov — najviac ±0,02 €. Inak (karta, prevod, iná mena) rovnaký limit
 * ako prijatá faktúra (`maxZaokruhlenie`: 0,50 €, 1 Kč, 5 Ft).
 */
export function maxZaokruhleniaBlocku(platba?: string | null, mena?: string | null): number {
  const m = String(mena ?? "").trim().toUpperCase() || "EUR";
  if (platba === "hotovost" && m === "EUR") return MAX_ZAOKRUHLENIE;
  return maxZaokruhlenie(m);
}

/** Je zaokrúhlenie bločku v povolených medziach? */
export function jePovoleneZaokruhlenieBlocku(
  zaokruhlenie: number | string | null | undefined,
  platba?: string | null,
  mena?: string | null,
): boolean {
  return Math.abs(r2(Number(zaokruhlenie) || 0)) <= maxZaokruhleniaBlocku(platba, mena) + 1e-9;
}

/**
 * Chyba zaokrúhlenia bločku pre server a API (`null` = v poriadku). Zaokrúhlenie
 * sa číta z položiek (`items`, položka „Zaokrúhlenie“).
 */
export function chybaZaokruhleniaBlocku(d: {
  items?: unknown;
  payment_method?: unknown;
  currency?: unknown;
}): string | null {
  const z = zaokruhlenieZPoloziek(d.items);
  const platba = d.payment_method == null ? null : String(d.payment_method);
  const mena = String(d.currency ?? "EUR").toUpperCase() || "EUR";
  if (jePovoleneZaokruhlenieBlocku(z, platba, mena)) return null;
  const max = maxZaokruhleniaBlocku(platba, mena);
  const f = (n: number) => n.toFixed(2).replace(".", ",");
  return `Zaokrúhlenie ${f(z)} ${mena} je priveľké — najviac ±${f(max)} ${mena}${
    platba === "hotovost" && mena === "EUR" ? " (hotovosť sa zaokrúhľuje na 5 centov)" : ""
  }. Rozdiel nie je zaokrúhlenie — doplňte ho do rozpisu DPH alebo opravte sumu bločku.`;
}

/** Názov položky, pod ktorým Faktero zaokrúhlenie ukladá. */
export const NAZOV_ZAOKRUHLENIA = "Zaokrúhlenie";

const VZOR = /zaokr[uú]hl|zaokrouhl|\brounding\b|\brundung\b/i;

type PolozkaLike = { name?: string | null; total?: number | string | null; unit_price?: number | string | null; quantity?: number | string | null; zaokruhlenie?: boolean };

/** Je položka zaokrúhlenie (podľa príznaku alebo názvu, ako ho píšu pokladnice)? */
export function jePolozkaZaokruhlenia(p: PolozkaLike | null | undefined): boolean {
  if (!p) return false;
  if (p.zaokruhlenie === true) return true;
  return VZOR.test(String(p.name ?? ""));
}

function sumaPolozky(p: PolozkaLike): number {
  if (p.total != null && p.total !== "") return Number(p.total) || 0;
  return (Number(p.quantity) || 1) * (Number(p.unit_price) || 0);
}

/** Zaokrúhlenie zo zoznamu položiek (súčet všetkých položiek zaokrúhlenia). */
export function zaokruhlenieZPoloziek(polozky: unknown): number {
  if (!Array.isArray(polozky)) return 0;
  return r2(
    (polozky as PolozkaLike[]).filter(jePolozkaZaokruhlenia).reduce((a, p) => a + sumaPolozky(p), 0),
  );
}

/** Položky bez zaokrúhlenia. */
export function bezZaokruhlenia<T extends PolozkaLike>(polozky: T[]): T[] {
  return polozky.filter((p) => !jePolozkaZaokruhlenia(p));
}

/** Položka zaokrúhlenia v tvare položiek bločku (`items`). */
export function polozkaZaokruhlenia(suma: number) {
  const s = r2(suma);
  return {
    name: NAZOV_ZAOKRUHLENIA,
    quantity: 1,
    unit: null as string | null,
    unit_price: s,
    vat_rate: 0,
    total: s,
    zaokruhlenie: true as const,
  };
}

/**
 * Položky so zaokrúhlením nastaveným na `suma` — staré položky zaokrúhlenia
 * sa nahradia jednou (na konci), nulové zaokrúhlenie položku odstráni.
 */
export function nastavZaokruhlenie<T extends PolozkaLike>(
  polozky: T[] | null | undefined,
  suma: number | null | undefined,
): (T | ReturnType<typeof polozkaZaokruhlenia>)[] {
  const ine = bezZaokruhlenia(Array.isArray(polozky) ? polozky : []);
  const s = r2(Number(suma) || 0);
  return Math.abs(s) >= 0.005 ? [...ine, polozkaZaokruhlenia(s)] : ine;
}

export type KontrolaSumy = {
  /** Základ + DPH + zaokrúhlenie. */
  zRiadkov: number;
  /** Suma bločku. */
  celkom: number;
  /** Suma bločku mínus súčet riadkov (kladné = v riadkoch chýba). */
  rozdiel: number;
  sedi: boolean;
  /**
   * Rozdiel, ktorý sa dá zaúčtovať ako zaokrúhlenie hotovosti (do 2 centov
   * spolu so zaokrúhlením, ktoré už na doklade je), inak `null`.
   */
  navrhZaokruhlenia: number | null;
};

/**
 * Sedí súčet riadkov (základ + DPH + zaokrúhlenie) so sumou bločku?
 * Bez sumy alebo bez riadkov sa nekontroluje nič (`sedi: true`).
 */
export function kontrolaSumyBlocku(v: {
  celkom: number | string | null | undefined;
  zaklad: number | string | null | undefined;
  dph: number | string | null | undefined;
  zaokruhlenie?: number | string | null;
  platba?: string | null;
}): KontrolaSumy {
  const celkom = r2(Number(v.celkom) || 0);
  const zaokr = r2(Number(v.zaokruhlenie) || 0);
  const zRiadkov = r2((Number(v.zaklad) || 0) + (Number(v.dph) || 0) + zaokr);
  const prazdne = v.celkom == null || v.celkom === "" || (!Number(v.zaklad) && !Number(v.dph));
  const rozdiel = prazdne ? 0 : r2(celkom - zRiadkov);
  const sedi = Math.abs(rozdiel) < 0.005;
  const nove = r2(zaokr + rozdiel);
  const navrhZaokruhlenia =
    !sedi && v.platba === "hotovost" && Math.abs(nove) <= MAX_ZAOKRUHLENIE + 0.0001 ? nove : null;
  return { zRiadkov, celkom, rozdiel, sedi, navrhZaokruhlenia };
}

/** Kontrola uloženého bločku (`expense_documents`): rozpis DPH + položka zaokrúhlenia vs. suma. */
export function kontrolaUlozenehoBlocku(d: {
  total_amount?: unknown;
  net_amount?: unknown;
  vat_amount?: unknown;
  vat_breakdown?: unknown;
  items?: unknown;
  payment_method?: unknown;
}): KontrolaSumy {
  const rozpis = Array.isArray(d.vat_breakdown) ? (d.vat_breakdown as any[]) : null;
  const zaklad = rozpis?.length ? rozpis.reduce((a, x) => a + (Number(x?.zaklad) || 0), 0) : Number(d.net_amount) || 0;
  const dph = rozpis?.length ? rozpis.reduce((a, x) => a + (Number(x?.dph) || 0), 0) : Number(d.vat_amount) || 0;
  return kontrolaSumyBlocku({
    celkom: d.total_amount as any,
    zaklad,
    dph,
    zaokruhlenie: zaokruhlenieZPoloziek(d.items),
    platba: String(d.payment_method ?? ""),
  });
}
