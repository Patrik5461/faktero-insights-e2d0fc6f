/**
 * Názov banky podľa IBAN — kód banky je v slovenskom aj českom IBAN na
 * pozíciách 5–8. Pri multibankingu (účet v ČSOB pripojený cez Tatra banku)
 * je to jediný spoľahlivý zdroj, lebo pripojenie hovorí len o sprostredkovateľovi.
 */
const SK: Record<string, string> = {
  "0200": "Všeobecná úverová banka, a.s.",
  "0720": "Národná banka Slovenska",
  "0900": "Slovenská sporiteľňa, a.s.",
  "1100": "Tatra banka, a.s.",
  "1111": "UniCredit Bank Czech Republic and Slovakia, a.s.",
  "3000": "Slovenská záručná a rozvojová banka, a.s.",
  "3100": "365.bank, a.s.",
  "5200": "OTP Banka Slovensko, a.s.",
  "5600": "Prima banka Slovensko, a.s.",
  "6500": "365.bank, a.s.",
  "7300": "ING Bank N.V.",
  "7500": "Československá obchodná banka, a.s.",
  "7930": "Wüstenrot stavebná sporiteľňa, a.s.",
  "8050": "Commerzbank AG",
  "8120": "Privatbanka, a.s.",
  "8180": "Štátna pokladnica",
  "8320": "J&T BANKA, a.s.",
  "8330": "Fio banka, a.s.",
  "8360": "mBank S.A.",
  "8420": "BKS Bank AG",
};

const CZ: Record<string, string> = {
  "0100": "Komerční banka, a.s.",
  "0300": "Československá obchodní banka, a.s.",
  "0600": "MONETA Money Bank, a.s.",
  "0710": "Česká národní banka",
  "0800": "Česká spořitelna, a.s.",
  "2010": "Fio banka, a.s.",
  "2250": "Banka CREDITAS a.s.",
  "2700": "UniCredit Bank Czech Republic and Slovakia, a.s.",
  "3030": "Air Bank a.s.",
  "3500": "ING Bank N.V.",
  "5500": "Raiffeisenbank a.s.",
  "6210": "mBank S.A.",
};

/** Poskytovateľ pripojenia, keď sa banka z IBAN určiť nedá (Wise, Revolut…). */
const POSKYTOVATELIA: Record<string, string> = {
  tatrabanka: "Tatra banka, a.s.",
  wise: "Wise",
  revolut: "Revolut",
  fio: "Fio banka, a.s.",
  wallester: "Wallester",
};

export function nazovBanky(
  iban: string | null | undefined,
  provider?: string | null,
): string | null {
  const i = String(iban ?? "")
    .replace(/\s/g, "")
    .toUpperCase();
  const kod = i.slice(4, 8);
  if (i.startsWith("SK") && SK[kod]) return SK[kod];
  if (i.startsWith("CZ") && CZ[kod]) return CZ[kod];
  return (provider && POSKYTOVATELIA[provider]) || null;
}
