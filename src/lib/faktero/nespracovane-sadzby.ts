import { krajinaDane, sadzbyKrajiny } from "./vat-rates";

/**
 * Sadzby DPH na výber v nespracovanom doklade — podľa krajiny firmy
 * (SK 23/19/5/0, CZ 21/12/0), nie napevno slovenské. Bez krajiny SK.
 */
export function sadzbyNespracovaneho(
  krajinaFirmy: string | null | undefined,
  den?: string | null,
): number[] {
  return sadzbyKrajiny(krajinaDane(krajinaFirmy ?? "SK"), den || null);
}
