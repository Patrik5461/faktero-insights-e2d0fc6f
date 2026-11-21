/**
 * Partnerský program pre účtovníkov — pravidlá bez databázy.
 *
 * Účtovník sa prihlási, admin ho schváli a dostane kód. Firmy sa k nemu
 * priradia odkazom `?partner=KOD` pri registrácii alebo tým, že je v nich
 * členom (spúšťač v databáze). Z každej zaplatenej platby predplatného
 * priradenej firmy vznikne provízia zo sumy bez DPH. Provízia 30 dní čaká
 * (vrátenie platby), potom je na výplatu.
 */

export type StavPartnera = "ziadost" | "aktivny" | "pozastaveny" | "zamietnuty";
export type StavProvizie = "caka" | "na_vyplatu" | "vyplatene" | "storno";
export type ZdrojPriradenia = "odkaz" | "clen" | "admin";

export const PREDVOLENA_PROVIZIA_PCT = 20;
/** Koľko dní provízia čaká, kým sa dá vyplatiť (lehota na vrátenie platby). */
export const DNI_CAKANIA_PROVIZIE = 30;
/** Kľúč v prehliadači, pod ktorým prežije kód partnera registráciu aj Google. */
export const PARTNER_KOD_KEY = "faktero_partner_kod";

export const NAZOV_STAVU_PARTNERA: Record<StavPartnera, string> = {
  ziadost: "Čaká na schválenie",
  aktivny: "Aktívny partner",
  pozastaveny: "Pozastavený",
  zamietnuty: "Zamietnutý",
};

export const NAZOV_STAVU_PROVIZIE: Record<StavProvizie, string> = {
  caka: "Čaká 30 dní",
  na_vyplatu: "Na výplatu",
  vyplatene: "Vyplatená",
  storno: "Zrušená (platba vrátená)",
};

export const NAZOV_ZDROJA: Record<ZdrojPriradenia, string> = {
  odkaz: "Odkaz na odporúčanie",
  clen: "Ste členom firmy",
  admin: "Priradil admin",
};

/** Bez znakov, ktoré sa pri prepisovaní pletú (0/O, 1/I/L). */
const ABECEDA_KODU = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Nový kód z náhodných bajtov (`crypto.getRandomValues`), 6 znakov. */
export function novyKodPartnera(nahodne: Uint8Array): string {
  let kod = "";
  for (let i = 0; i < 6; i++) kod += ABECEDA_KODU[(nahodne[i] ?? 0) % ABECEDA_KODU.length];
  return kod;
}

/** Kód z odkazu: veľké písmená, len A–Z a 0–9, 4–12 znakov; inak `null`. */
export function normalizujKodPartnera(vstup: unknown): string | null {
  if (typeof vstup !== "string") return null;
  const kod = vstup.trim().toUpperCase();
  return /^[A-Z0-9]{4,12}$/.test(kod) ? kod : null;
}

/** Odkaz na odporúčanie, ktorý partner rozosiela klientom. */
export function odkazPartnera(kod: string, zaklad = "https://www.faktero.sk"): string {
  return `${zaklad.replace(/\/+$/, "")}/registracia?partner=${encodeURIComponent(kod)}`;
}

/**
 * Provízia 30 dní čaká; potom je na výplatu. Databáza drží `caka`, kým ju
 * neprepne server — na obrazovke sa stav počíta podľa dátumu, nech je vždy
 * pravdivý aj bez cronu.
 */
export function stavProvizieDnes(
  p: { stav: StavProvizie; zaplatene_at: string },
  dnes: Date = new Date(),
): StavProvizie {
  if (p.stav !== "caka") return p.stav;
  const zaplatene = Date.parse(p.zaplatene_at);
  if (!Number.isFinite(zaplatene)) return p.stav;
  return dnes.getTime() - zaplatene >= DNI_CAKANIA_PROVIZIE * 864e5 ? "na_vyplatu" : "caka";
}

export type SuhrnProvizii = {
  cakaCents: number;
  naVyplatuCents: number;
  vyplateneCents: number;
  tentoMesiacCents: number;
};

/** Súčty pre prehľad partnera; zrušené provízie sa nepočítajú nikam. */
export function suhrnProvizii(
  provizie: { stav: StavProvizie; zaplatene_at: string; provizia_cents: number }[],
  dnes: Date = new Date(),
): SuhrnProvizii {
  const mesiac = dnes.toISOString().slice(0, 7);
  const s: SuhrnProvizii = { cakaCents: 0, naVyplatuCents: 0, vyplateneCents: 0, tentoMesiacCents: 0 };
  for (const p of provizie) {
    const stav = stavProvizieDnes(p, dnes);
    if (stav === "storno") continue;
    if (stav === "caka") s.cakaCents += p.provizia_cents;
    else if (stav === "na_vyplatu") s.naVyplatuCents += p.provizia_cents;
    else s.vyplateneCents += p.provizia_cents;
    if (p.zaplatene_at.slice(0, 7) === mesiac) s.tentoMesiacCents += p.provizia_cents;
  }
  return s;
}

/** IBAN na výplatu: bez medzier, veľkými; prázdny je v poriadku (doplní sa neskôr). */
export function normalizujIban(vstup: string | null | undefined): string | null {
  const s = (vstup ?? "").replace(/\s+/g, "").toUpperCase();
  return s ? s : null;
}

export function jePlatnyIban(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const preusporiadany = iban.slice(4) + iban.slice(0, 4);
  let zvysok = 0;
  for (const z of preusporiadany) {
    const cislo = /\d/.test(z) ? z : String(z.charCodeAt(0) - 55);
    for (const c of cislo) zvysok = (zvysok * 10 + Number(c)) % 97;
  }
  return zvysok === 1;
}
