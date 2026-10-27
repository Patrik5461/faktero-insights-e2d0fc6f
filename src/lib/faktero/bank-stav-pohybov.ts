/**
 * Stav sťahovania pohybov z bankového účtu.
 *
 * Banka vydá zostatok aj vtedy, keď jej vypršal súhlas na čítanie pohybov
 * (Slovenská sporiteľňa cez multibanking Tatra banky po 90 dňoch hlási
 * `SCA_EXPIRED`). Účet potom vyzeral živý, no platby týždne nechodili a nikto
 * o tom nevedel — chyba bola len v logu servera.
 */

/** Po koľkých hodinách bez úspechu sa chyba ukáže človeku. Jednorazové 401/500 banky prejdú samy. */
export const HODIN_BEZ_POHYBOV = 48;

export function popisChybyPohybov(sprava: string): string {
  const t = String(sprava ?? "");
  if (/SCA_EXPIRED|SCA expired/i.test(t)) {
    return "Súhlas banky na čítanie pohybov vypršal — obnovte ho (Obnoviť súhlas).";
  }
  if (/CONSENT_(EXPIRED|INVALID|REVOKED)|consent.*(expired|invalid|revoked)/i.test(t)) {
    return "Súhlas s prístupom k účtu už neplatí — obnovte ho (Obnoviť súhlas).";
  }
  if (/\b401\b/.test(t))
    return "Banka odmietla prístup k pohybom (401) — ak to trvá, obnovte súhlas.";
  if (/\b5\d\d\b/.test(t)) return "Banka je dočasne nedostupná — pohyby sa skúsia stiahnuť znova.";
  return "Pohyby sa nepodarilo stiahnuť.";
}

/** Vypršaný či zrušený súhlas — bez obnovenia človekom sa neopraví. */
export function jeChybaSuhlasu(sprava: string): boolean {
  return /SCA_EXPIRED|SCA expired|CONSENT_(EXPIRED|INVALID|REVOKED)|consent.*(expired|invalid|revoked)/i.test(
    String(sprava ?? ""),
  );
}

/** Treba to človeku ukázať? Len keď zlyhanie trvá dlhšie, než je bežný výpadok banky. */
export function pohybyZastarane(
  u: { pohyby_chyba?: string | null; pohyby_ok_at?: string | null },
  teraz: Date = new Date(),
): boolean {
  if (!u.pohyby_chyba) return false;
  if (!u.pohyby_ok_at) return true;
  return teraz.getTime() - Date.parse(u.pohyby_ok_at) > HODIN_BEZ_POHYBOV * 3_600_000;
}
