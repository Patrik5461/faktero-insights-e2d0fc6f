import { LEGAL_VERSION } from "./legal-verzia";

/**
 * Súhlasy udelené pri registrácii — a ich záchranná sieť.
 *
 * Zápis súhlasu potrebuje prihlásenie, lenže pri registrácii ho ešte nemáme:
 * cez Google sa odchádza na presmerovanie a pri registrácii e-mailom Supabase
 * reláciu nevydá, kým sa adresa nepotvrdí. Doteraz sa v tej chvíli zapísal
 * kľúč do `sessionStorage` a **nikto ho už nikdy neprečítal** — súhlas
 * registrácie cez Google sa tak nezaznamenal ani raz.
 *
 * Preto sa odloží sem a zapíše sa pri najbližšom prihlásenom otvorení
 * aplikácie (web aj appka). Kľúč sa maže až po úspešnom zápise; keď server
 * neodpovie, skúsi sa to nabudúce.
 */

/** Dokumenty, ktoré človek pri registrácii odklikáva. */
export const DOKUMENTY_REGISTRACIE = [
  { document_type: "obchodne-podmienky", version: LEGAL_VERSION },
  { document_type: "gdpr", version: LEGAL_VERSION },
  { document_type: "cookies", version: LEGAL_VERSION },
] as const;

/*
  Zámerne `localStorage`, nie `sessionStorage`: pri registrácii v telefóne sa
  medzitým odchádza do prehliadača potvrdiť e-mail a appka sa cestou späť
  reštartuje — sedenie by neprežilo.
*/
const KLUC = "faktero_legal_pending";

export function odlozSuhlasy(verzia: string = LEGAL_VERSION) {
  try {
    localStorage.setItem(KLUC, verzia);
  } catch {
    // súkromné okno alebo zakázané úložisko — súhlas sa zapíše až pri ďalšej registrácii
  }
}

export function cakajuceSuhlasy(): string | null {
  try {
    return localStorage.getItem(KLUC);
  } catch {
    return null;
  }
}

function zabudni() {
  try {
    localStorage.removeItem(KLUC);
  } catch {
    /* nič sa nedeje, prepíše sa */
  }
}

/**
 * Zapíše odložené súhlasy, ak nejaké čakajú. Volajúci dodá spôsob zápisu —
 * web serverovú funkciu, appka most.
 */
export type ZapisSuhlasov = (vstup: { data: unknown }) => Promise<unknown>;

export async function zapisOdlozeneSuhlasy(zapis: ZapisSuhlasov): Promise<boolean> {
  const verzia = cakajuceSuhlasy();
  if (!verzia) return false;
  try {
    await zapis({
      data: { documents: DOKUMENTY_REGISTRACIE.map((d) => ({ ...d, version: verzia })) },
    });
    zabudni();
    return true;
  } catch (e) {
    console.warn("[pravne-suhlasy] zápis sa nepodaril, skúsime nabudúce", e);
    return false;
  }
}
