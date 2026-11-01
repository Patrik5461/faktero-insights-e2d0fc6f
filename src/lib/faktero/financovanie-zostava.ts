/*
  „Zostáva splatiť“ na /financovanie — len leasingy a úvery (kontokorent nemá
  predpis, len čerpanie) a vždy po menách zmlúv. Rôzne meny sa nesčítajú.
*/
import { sucetPoMenach } from "./mena-sucet";

export type ZmluvaNaZostavu = {
  kind: string;
  status: string;
  currency?: string | null;
  zostavaSuma: number;
};

export function zostavaPodlaMien(
  zmluvy: readonly ZmluvaNaZostavu[],
  domaca = "EUR",
): Map<string, number> {
  return sucetPoMenach(
    zmluvy.filter((z) => z.status === "active" && z.kind !== "kontokorent"),
    (z) => z.zostavaSuma,
    (z) => z.currency,
    domaca,
  );
}

/**
 * Mena, v ktorej sa zmluva uloží: kontokorent menou zvoleného účtu, leasing a
 * úver zvolenou alebo uloženou menou, inak domácou menou firmy (CZ → CZK).
 * Úprava už nikdy neprepíše uloženú menu na EUR.
 */
export function menaZmluvy(p: {
  kontokorent: boolean;
  volba?: string | null;
  menaUctu?: string | null;
  ulozena?: string | null;
  domaca: string;
}): string {
  if (p.kontokorent) return p.menaUctu || p.ulozena || p.domaca;
  return p.volba || p.ulozena || p.domaca;
}
