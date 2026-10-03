/*
  Rýchla akcia na ikone appky (podržanie ikony → „Naskenovať bloček").

  Natívna časť (`SceneDelegate.swift`, `res/xml/shortcuts.xml`) ju posiela ako
  adresu `faktero://akcia/<názov>` cez tú istú cestu ako odkazy do appky
  (`appUrlOpen`). Tu sa len odloží a ohlási — otvoriť skener smie až `MobilApp`,
  keď je človek prihlásený, má vybranú firmu a appka nie je zamknutá. Akcia,
  ktorá príde pri studenom štarte, preto počká, kým si ju appka vyzdvihne.
*/

export type RychlaAkcia = "skener";

const AKCIE: readonly RychlaAkcia[] = ["skener"];
export const UDALOST_RYCHLEJ_AKCIE = "faktero:rychla-akcia";

let cakajuca: RychlaAkcia | null = null;

/** `faktero://akcia/skener` → `"skener"`; iná adresa → `null`. */
export function akciaZAdresy(adresa: string): RychlaAkcia | null {
  try {
    const u = new URL(adresa);
    if (u.protocol !== "faktero:") return null;
    // Pri vlastnej schéme je „akcia" host, nie začiatok cesty.
    const casti = [u.hostname, ...u.pathname.split("/")].filter(Boolean);
    if (casti[0] !== "akcia") return null;
    const nazov = casti[1] as RychlaAkcia | undefined;
    return nazov && AKCIE.includes(nazov) ? nazov : null;
  } catch {
    return null;
  }
}

/** Zapamätá akciu a ohlási ju bežiacej appke. Vráti, či adresa akciou bola. */
export function prijmiAdresu(adresa: string): boolean {
  const akcia = akciaZAdresy(adresa);
  if (!akcia) return false;
  cakajuca = akcia;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UDALOST_RYCHLEJ_AKCIE, { detail: akcia }));
  }
  return true;
}

/** Vydá čakajúcu akciu práve raz. */
export function vyzdvihniAkciu(): RychlaAkcia | null {
  const a = cakajuca;
  cakajuca = null;
  return a;
}
