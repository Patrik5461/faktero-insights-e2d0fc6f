/**
 * Vozidlo, ktorým sa v tomto telefóne jazdí.
 *
 * Automaticky rozpoznanú jazdu vie appka uložiť sama len vtedy, keď vie, do
 * ktorého auta človek sadol. Pri jedinom aute vo firme je to jasné, pri
 * viacerých sa to dovtedy muselo pri každej jazde vyklikať. Voľba je zámerne
 * uložená v telefóne, nie v databáze — patrí k zariadeniu („toto je moje auto"),
 * nie k firme, a dvaja ľudia s dvoma telefónmi tak môžu mať každý svoje.
 */

const KLUC = "faktero.mobil.vozidlo";

function kluc(companyId: string): string {
  return `${KLUC}.${companyId}`;
}

export function mojeVozidlo(companyId: string): string | null {
  if (typeof localStorage === "undefined" || !companyId) return null;
  try {
    return localStorage.getItem(kluc(companyId)) || null;
  } catch {
    return null;
  }
}

export function zapamatajVozidlo(companyId: string, vehicleId: string | null): void {
  if (typeof localStorage === "undefined" || !companyId) return;
  try {
    if (vehicleId) localStorage.setItem(kluc(companyId), vehicleId);
    else localStorage.removeItem(kluc(companyId));
  } catch {
    /* súkromný režim prehliadača — voľba sa proste nezapamätá */
  }
}

/**
 * Do ktorého auta sa má rozpoznaná jazda uložiť bez pýtania. Vráti `null`, keď
 * to nie je jednoznačné — vtedy sa musí spýtať človeka.
 */
export function vozidloPreRozpoznanuJazdu(args: {
  companyId: string;
  dostupne: string[];
}): string | null {
  const { companyId, dostupne } = args;
  if (dostupne.length === 1) return dostupne[0]!;
  const moje = mojeVozidlo(companyId);
  // Zapamätané auto mohlo medzitým zmiznúť alebo byť vyradené — vtedy radšej nič.
  return moje && dostupne.includes(moje) ? moje : null;
}
