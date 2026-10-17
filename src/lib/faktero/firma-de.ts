/**
 * Nemecká firma — identifikátory a údaje z obchodného registra.
 *
 * Nemecko slovenské IČO nepozná. Firma tam má **Steuernummer** od miestneho
 * Finanzamtu (napr. „12/345/67890“) a ak obchoduje v EÚ, aj **USt-IdNr.**
 * („DE“ + 9 číslic). Aby netrebalo nové stĺpce a všetky exporty, PDF a výkazy
 * fungovali ďalej, Steuernummer sa ukladá do `dic` a USt-IdNr. do `ic_dph` —
 * mení sa len to, ako sa polia volajú vo formulári. IČO je pre DE nepovinné;
 * jeho miesto preberá číslo v Handelsregister (`handelsregister_nr`).
 *
 * Na faktúre musí byť Steuernummer **alebo** USt-IdNr. predávajúceho
 * (§ 14 Abs. 4 Nr. 2 UStG).
 */
import { krajinaDane, type KrajinaDane } from "./vat-rates";
import { upravIcDph } from "./vies";

/** Popisky identifikátorov firmy vo formulári podľa krajiny. */
export function popiskyIdentifikatorov(krajina: KrajinaDane | string | null | undefined): {
  ico: string;
  dic: string;
  icDph: string;
  /** Či sa IČO vo formulári vyžaduje / ponúka vyhľadanie v registri. */
  icoPovinne: boolean;
} {
  const k = krajinaDane(krajina);
  if (k === "DE")
    return { ico: "IČO (nepovinné)", dic: "Steuernummer", icDph: "USt-IdNr.", icoPovinne: false };
  return { ico: "IČO", dic: "DIČ", icDph: "IČ DPH", icoPovinne: true };
}

/** USt-IdNr.: „DE“ a presne 9 číslic. Medzery a bodky sa pred kontrolou zahodia. */
export function jeUstIdNr(v: string | null | undefined): boolean {
  return /^DE\d{9}$/.test(upravIcDph(v));
}

/**
 * Steuernummer — každá spolková krajina má svoj zápis („12/345/67890“,
 * „123/456/78901“, „12345/67890“), jednotný je len 13-miestny tvar pre ELSTER.
 * Kontroluje sa preto len to, čo platí všade: číslice s lomkami alebo
 * medzerami, spolu 10 až 13 číslic.
 */
export function jeSteuernummer(v: string | null | undefined): boolean {
  const s = String(v ?? "").trim();
  if (!/^[\d\s/]+$/.test(s)) return false;
  const cislic = s.replace(/\D/g, "").length;
  return cislic >= 10 && cislic <= 13;
}

/** Chyby identifikátorov nemeckej firmy na zobrazenie pod formulárom (slovenské kľúče pre `t`). */
export function chybyIdentifikatorovDe(firma: {
  dic?: string | null;
  ic_dph?: string | null;
}): string[] {
  const chyby: string[] = [];
  const dic = String(firma.dic ?? "").trim();
  const ust = String(firma.ic_dph ?? "").trim();
  if (ust && !jeUstIdNr(ust)) chyby.push("USt-IdNr. má tvar DE a 9 číslic, napríklad DE123456789.");
  if (dic && !jeSteuernummer(dic))
    chyby.push("Steuernummer má 10 až 13 číslic, napríklad 12/345/67890.");
  if (!dic && !ust)
    chyby.push(
      "Na faktúre musí byť Steuernummer alebo USt-IdNr. (§ 14 Abs. 4 UStG) — vyplňte aspoň jedno.",
    );
  return chyby;
}

/**
 * Riadok do päty faktúry: Handelsregister a Geschäftsführer, ak sú vyplnené.
 * Pre GmbH sú to povinné údaje na obchodných listoch (§ 35a GmbHG).
 */
export function pataFirmyDe(firma: {
  registergericht?: string | null;
  handelsregister_nr?: string | null;
  geschaeftsfuehrer?: string | null;
}): string | null {
  const sud = String(firma.registergericht ?? "").trim();
  const cislo = String(firma.handelsregister_nr ?? "").trim();
  const konatel = String(firma.geschaeftsfuehrer ?? "").trim();
  const casti: string[] = [];
  // „Amtsgericht München, HRB 123456“ — tak, ako to stojí na nemeckých faktúrach.
  if (sud || cislo) casti.push([sud, cislo].filter(Boolean).join(", "));
  if (konatel) casti.push(`Geschäftsführer: ${konatel}`);
  return casti.length ? casti.join(" · ") : null;
}
