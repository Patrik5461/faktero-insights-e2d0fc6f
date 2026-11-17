/*
  Testovacia firma a banka / platby (pozri testovacia-firma.ts).

  Testovacia firma sa nikdy nepripája k banke ani k platobnej bráne, neposiela
  platby a nevytvára online platby pre zákazníkov — všetko to ide mimo Faktera
  v mene firmy. Ručné akcie sa zastavia hláškou (`TestovaciaFirmaZastavene`),
  nočné behy testovacie firmy potichu preskočia (len log).
*/
import { testovacieZoZoznamu, zastavAkTestovacia } from "./testovacia-firma.server";

export const HLASKA_TESTOVACIA_BANKA = "Testovacia firma — banka sa nepripája (náhľad).";
export const HLASKA_TESTOVACIA_PLATBA =
  "Testovacia firma — platba sa neodoslala do banky (náhľad).";
export const HLASKA_TESTOVACIA_BRANA =
  "Testovacia firma — platobná brána sa v testovacej firme nepripája.";
export const HLASKA_TESTOVACIA_ONLINE_PLATBA =
  "Testovacia firma — online platba sa v testovacej firme nevytvorí (náhľad).";

type Klient = Parameters<typeof zastavAkTestovacia>[2];

/** Pripojenie, obnova súhlasu a ručná synchronizácia banky. */
export function zastavBankuTestovacej(companyId: string, klient?: Klient): Promise<void> {
  return zastavAkTestovacia(companyId, HLASKA_TESTOVACIA_BANKA, klient);
}

/** Platba / príkaz odoslaný do banky. */
export function zastavPlatbuTestovacej(companyId: string, klient?: Klient): Promise<void> {
  return zastavAkTestovacia(companyId, HLASKA_TESTOVACIA_PLATBA, klient);
}

/** Pripojenie a skúška platobnej brány firmy. */
export function zastavBranuTestovacej(companyId: string, klient?: Klient): Promise<void> {
  return zastavAkTestovacia(companyId, HLASKA_TESTOVACIA_BRANA, klient);
}

/**
 * Pre nočné behy: vráti len riadky skutočných firiem, testovacie preskočí s logom.
 * Keď sa firmy nedajú overiť, vyhodí (beh radšej zlyhá, než by išiel do banky).
 */
export async function bezTestovacichFiriem<T extends { company_id?: string | null }>(
  riadky: T[],
  oblast: string,
  klient?: Klient,
): Promise<T[]> {
  const ids = [...new Set(riadky.map((r) => r.company_id).filter((x): x is string => !!x))];
  if (!ids.length) return riadky;
  const testovacie = await testovacieZoZoznamu(ids, klient);
  if (!testovacie.size) return riadky;
  const ostatne = riadky.filter((r) => !r.company_id || !testovacie.has(r.company_id));
  console.log(
    `[${oblast}] testovacia firma preskočená (${riadky.length - ostatne.length} riadkov, firmy: ${[...testovacie].join(", ")})`,
  );
  return ostatne;
}
