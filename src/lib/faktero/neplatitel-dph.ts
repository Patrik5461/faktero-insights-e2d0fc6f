/**
 * Prijatý doklad neplatiteľa DPH (Patrik 17. 11.: „Pri neplatiteľskej s.r.o.
 * nesmie na bločku rozpisovať DPH, lebo mi ho nedovolí zaúčtovať.“).
 *
 * Neplatiteľ si DPH neodpočíta — celá suma dokladu je náklad. Prijatý doklad
 * (bloček, prijatá faktúra, nespracovaný, appka, mail, API, import) preto
 * nikdy nemá `odpocet = true` (poistka je aj spúšťač v databáze), rozpis DPH
 * sa od neho nepýta a kontroly sadzieb / rozpisu ho nezastavia. Prečítaná
 * DPH (z bločku, z AI) sa nezahadzuje — len sa neodpočítava.
 *
 * Výnimka: prenesenie daňovej povinnosti (samozdanenie) — to odvádza aj
 * registrovaná osoba podľa § 7 / § 7a, tam sa rozpis kontroluje ďalej.
 *
 * Kto je neplatiteľ, hovorí vždy `jeNeplatitel` (podľa `vat_scheme`).
 */
import type { FirmaDph } from "./dph-rezim";
import { jeNeplatitel } from "./uctovanie-agenda";

/** Jedna veta namiesto rozpisu DPH vo formulároch neplatiteľa. */
export const VETA_NEPLATITEL_DPH = "Neplatiteľ DPH — DPH sa neodpočítava, celá suma ide do nákladov.";

/** Stĺpce `companies`, z ktorých `jeNeplatitel` rozhoduje. */
export const STLPCE_REZIMU_DPH = "country, ic_dph, vat_payer, vat_scheme";

/**
 * Netreba kontrolovať rozpis DPH (povinný rozpis, zákonné sadzby, súčty)?
 * Neplatiteľ bez prenesenia — DPH mu do priznania nejde.
 */
export function bezKontrolyRozpisuDph(
  neplatitel: boolean | null | undefined,
  prenesenie?: boolean | null,
): boolean {
  return Boolean(neplatitel) && !prenesenie;
}

/** `odpocet` prijatého dokladu podľa firmy — neplatiteľ nikdy `true`. */
export function odpocetPodlaFirmy(firma: FirmaDph | null | undefined, odpocet: boolean): boolean {
  return jeNeplatitel(firma) ? false : odpocet;
}

/** Je riadok prijatej faktúry v prenesení (samozdanenie)? */
export function prijataVPreneseni(r: Record<string, unknown> | null | undefined): boolean {
  return r?.reverse_charge === true || r?.dph_rezim === "samozdanenie";
}

/**
 * Nespracovaný doklad neplatiteľa bez rozpisu DPH (rozpis sa nedal prečítať
 * alebo ho brána zákonných sadzieb zahodila) — celá suma ako jeden riadok
 * bez dane, aby doklad nevznikol so základom 0 a export mal čo zaúčtovať.
 * Prečítaný rozpis ostáva tak, ako je.
 */
export function doplnRozpisNeplatitela<
  R extends { sadzba: number; zaklad: number; dph: number },
  T extends { rozpis: R[]; celkom?: number | null; zaokruhlenie?: number | null; prenesenie?: boolean | null },
>(u: T, neplatitel: boolean | null | undefined): T {
  if (!bezKontrolyRozpisuDph(neplatitel, u.prenesenie) || u.rozpis.length) return u;
  const celkom = Number(u.celkom);
  if (u.celkom == null || !Number.isFinite(celkom) || !celkom) return u;
  const zaklad = Math.round((celkom - (Number(u.zaokruhlenie) || 0)) * 100) / 100;
  return { ...u, rozpis: [{ sadzba: 0, zaklad, dph: 0 } as R] };
}
