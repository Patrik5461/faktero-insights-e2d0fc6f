/*
  Zoznam mien do rozbaľovača dokladu: spoločný číselník `MENY` (ten istý ako
  na vystavenej faktúre) a k nemu vždy aj mena, ktorú doklad už nesie. Bez nej
  prehliadač ukáže prvú možnosť (EUR), hoci doklad je v PLN, a po prvej zmene
  sa PLN už zvoliť nedá (D-19).
*/
import { MENY } from "./mena";

export type MenaNaVyber = { code: string; symbol: string; name: string };

export function menyNaVyber(aktualna?: string | null): MenaNaVyber[] {
  const kod = String(aktualna ?? "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(kod) || MENY.some((m) => m.code === kod)) return MENY;
  return [...MENY, { code: kod, symbol: "", name: kod }];
}
