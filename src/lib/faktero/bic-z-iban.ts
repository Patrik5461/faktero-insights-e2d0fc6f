/**
 * Kód banky a BIC zo slovenského alebo českého IBAN-u — na zobrazenie
 * v platobných údajoch dokladu (dodávateľ BIC na faktúre často neuvádza).
 * Názov banky dáva `nazovBanky` v banka-z-iban.ts. Pri inej krajine alebo
 * neznámej banke vráti null.
 */

const BIC: Record<string, Record<string, string>> = {
  SK: {
    "0200": "SUBASKBX",
    "0720": "NBSBSKBX",
    "0900": "GIBASKBX",
    "1100": "TATRSKBX",
    "1111": "UNCRSKBX",
    "3000": "SLZBSKBA",
    "5200": "OTPVSKBX",
    "5600": "KOMASK2X",
    "7300": "INGBSKBX",
    "7500": "CEKOSKBX",
    "8180": "SPSRSKBA",
    "8330": "FIOZSKBA",
    "8360": "BREXSKBX",
  },
  CZ: {
    "0100": "KOMBCZPP",
    "0300": "CEKOCZPP",
    "0600": "AGBACZPP",
    "0710": "CNBACZPP",
    "0800": "GIBACZPX",
    "2010": "FIOBCZPP",
    "2700": "BACXCZPP",
    "3030": "AIRACZPP",
    "5500": "RZBCCZPP",
    "6210": "BREXCZPP",
  },
};

function cistyIban(iban: string | null | undefined): string {
  return String(iban ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

/** Štvormiestny kód banky (SK, CZ) z IBAN-u. */
export function kodBankyZIban(iban: string | null | undefined): string | null {
  const i = cistyIban(iban);
  if (!/^(SK|CZ)\d{22}$/.test(i)) return null;
  return i.slice(4, 8);
}

/** BIC známej slovenskej či českej banky z IBAN-u. */
export function bicZIban(iban: string | null | undefined): string | null {
  const i = cistyIban(iban);
  const kod = kodBankyZIban(i);
  if (!kod) return null;
  return BIC[i.slice(0, 2)]?.[kod] ?? null;
}
