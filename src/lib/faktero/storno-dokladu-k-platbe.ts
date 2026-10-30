/*
  Storno daňového dokladu k prijatej platbe, ktorý odišiel do Pohody ako
  interný doklad.

  Storno vo Fakteri = faktúra prejde do stavu „stornovaná“ a Pohode sa pošle
  stornujúci doklad (`<inv:cancelDocument>` v dávke, `nacitajStorna`). Ten
  však vie len agenda faktúr (invoice.xsd) a pokladne (voucher.xsd) — schéma
  interných dokladov (intDoc.xsd) žiadny `cancelDocument` nemá. Daňový doklad
  k platbe, ktorý Faktero predvolene posiela ako interný doklad
  (Predkontácie → Export → „Daňový doklad k platbe: interný doklad“), by tak
  Pohoda hľadala medzi faktúrami a nenašla. Preto sa do dávky nedáva
  a človek dostane návod, ako ho zrušiť v Pohode ručne.
*/
import type { DokladKPlatbe } from "./export-nastavenia";

/** Ide storno tohto dokladu do Pohody len ručne (interný doklad)? */
export function stornoLenRucne(
  typ: string | null | undefined,
  dokladKPlatbe: DokladKPlatbe | null | undefined,
): boolean {
  return String(typ ?? "") === "advance_payment" && (dokladKPlatbe ?? "interne") === "interne";
}

/** Storná rozdelené na tie, čo pôjdu v XML, a tie, ktoré treba v Pohode zrušiť ručne. */
export function rozdelStorna<T extends { typ?: string | null }>(
  storna: T[],
  dokladKPlatbe: DokladKPlatbe | null | undefined,
): { doXml: T[]; rucne: T[] } {
  const doXml: T[] = [];
  const rucne: T[] = [];
  for (const s of storna) (stornoLenRucne(s.typ, dokladKPlatbe) ? rucne : doXml).push(s);
  return { doXml, rucne };
}

/**
 * Riadok do súhrnu odovzdania (zoznam „preskočené“). Nezačína číslom dokladu
 * — súhrn podľa textu pred „ — “ páruje preskočené faktúry.
 */
export function hlaskaRucnychStorien(rucne: { cislo: string }[]): string | null {
  if (!rucne.length) return null;
  const cisla = rucne.map((s) => s.cislo).join(", ");
  const kolko =
    rucne.length === 1
      ? "Stornovaný daňový doklad k platbe"
      : `Stornované daňové doklady k platbe (${rucne.length})`;
  return (
    `${kolko} ${cisla} — do Pohody storno nepošleme: je tam ako interný doklad a ten sa cez XML ` +
    "stornovať nedá. V Pohode ho stornujte ručne: Účtovníctvo → Interné doklady, nájdite doklad " +
    "podľa čísla a zvoľte Záznam → Storno."
  );
}

/** Text okna pri storne jedného dokladu — kľúč prekladu, {cislo} doplní t(). */
export const OKNO_STORNO_DOKLADU_K_PLATBE =
  "Daňový doklad k platbe {cislo} je už v Pohode ako interný doklad. Interný doklad sa cez XML stornovať nedá, preto storno do Pohody nepošleme. Po stornovaní tu ho zrušte aj v Pohode: Účtovníctvo → Interné doklady, nájdite doklad {cislo} a zvoľte Záznam → Storno. Stornovať doklad vo Fakteri?";
