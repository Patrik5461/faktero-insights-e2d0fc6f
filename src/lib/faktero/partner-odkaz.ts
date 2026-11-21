/**
 * Kód partnera z odkazu `?partner=KOD` — odloží sa v prehliadači
 * (localStorage, nie sessionStorage: prežije potvrdenie e-mailu v inom okne
 * aj prihlásenie Googlom) a po založení prvej firmy sa uplatní.
 */
import { normalizujKodPartnera, PARTNER_KOD_KEY } from "@/lib/faktero/partner-program";

type Uloziste = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function uloziste(u?: Uloziste | null): Uloziste | null {
  if (u !== undefined) return u;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Odloží platný kód; neplatný ignoruje. Vráti uložený kód alebo `null`. */
export function odlozKodPartnera(vstup: unknown, u?: Uloziste | null): string | null {
  const kod = normalizujKodPartnera(vstup);
  const s = uloziste(u);
  if (!kod || !s) return null;
  try {
    s.setItem(PARTNER_KOD_KEY, kod);
    return kod;
  } catch {
    return null;
  }
}

export function nacitajKodPartnera(u?: Uloziste | null): string | null {
  const s = uloziste(u);
  if (!s) return null;
  try {
    return normalizujKodPartnera(s.getItem(PARTNER_KOD_KEY));
  } catch {
    return null;
  }
}

export function zmazKodPartnera(u?: Uloziste | null): void {
  const s = uloziste(u);
  try {
    s?.removeItem(PARTNER_KOD_KEY);
  } catch {
    // zakázané úložisko — nie je čo mazať
  }
}

/**
 * Po založení firmy: ak je odložený kód, priradí firmu partnerovi a kód zmaže
 * (aj keď priradenie neprešlo). Chyba nikdy nezastaví zakladanie firmy.
 */
export async function uplatniKodPartnera(
  companyId: string,
  prirad: (a: { data: { companyId: string; kod: string } }) => Promise<{ priradene: boolean }>,
  u?: Uloziste | null,
): Promise<boolean> {
  const kod = nacitajKodPartnera(u);
  if (!kod) return false;
  try {
    const { priradene } = await prirad({ data: { companyId, kod } });
    return priradene;
  } catch (e) {
    console.warn("[partner] priradenie firmy partnerovi zlyhalo", e);
    return false;
  } finally {
    zmazKodPartnera(u);
  }
}

/**
 * Voľba pri registrácii „Som účtovník / účtovná kancelária“. Prežije
 * prihlásenie Googlom aj potvrdenie e-mailu; po založení prvej firmy
 * onboarding zavedie účtovníka na prihlášku do partnerského programu.
 */
export type TypUctu = "firma" | "uctovnik";
export const TYP_UCTU_KEY = "faktero_typ_uctu";

export function normalizujTypUctu(vstup: unknown): TypUctu | null {
  return vstup === "uctovnik" || vstup === "firma" ? vstup : null;
}

export function odlozTypUctu(typ: TypUctu, u?: Uloziste | null): void {
  const s = uloziste(u);
  try {
    if (typ === "uctovnik") s?.setItem(TYP_UCTU_KEY, typ);
    else s?.removeItem(TYP_UCTU_KEY);
  } catch {
    // zakázané úložisko — účtovník si program nájde v menu účtu
  }
}

/** Prečíta voľbu a zmaže ju (použije sa raz, po založení prvej firmy). */
export function vezmiTypUctu(u?: Uloziste | null): TypUctu | null {
  const s = uloziste(u);
  if (!s) return null;
  try {
    const typ = normalizujTypUctu(s.getItem(TYP_UCTU_KEY));
    s.removeItem(TYP_UCTU_KEY);
    return typ;
  } catch {
    return null;
  }
}
