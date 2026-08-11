import { decryptSecret, encryptSecret, isDecryptError } from "./payment-crypto.server";

/**
 * Šifrovanie bankových tokenov v pokoji.
 *
 * `bank_connections.access_token` a `refresh_token` sú kľúče k účtom v banke —
 * najcitlivejší údaj v systéme. Do 2026-08-11 boli v databáze čitateľné, hoci
 * heslá k GPS jednotke, Tesle aj platobnej bráne šifrované sú. Zjednotené sú
 * cez ten istý AES-256-GCM (`payment-crypto.server`).
 *
 * Čítanie je **spätne kompatibilné**: keď hodnota nie je šifrovaná (staré
 * pripojenie alebo záznam spred prevodu), vráti sa tak, ako je. Vďaka tomu
 * nemusí prevod a nasadenie prebehnúť v tú istú sekundu a sťahovanie z banky
 * sa medzitým nezastaví.
 */

/** Token na použitie voči banke. Dešifruje, ak je čím; inak vráti pôvodné. */
export function bankToken(ulozene: string | null | undefined): string | null {
  if (!ulozene) return null;
  try {
    return decryptSecret(ulozene);
  } catch (e) {
    // Nešifrovaná hodnota nie je chyba — je to záznam spred prevodu.
    if (isDecryptError(e)) return ulozene;
    throw e;
  }
}

/** Token na uloženie do databázy. */
export function zasifrujBankToken(plain: string | null | undefined): string | null {
  if (!plain) return null;
  return encryptSecret(plain);
}
