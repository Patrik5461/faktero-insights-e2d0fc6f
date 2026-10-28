/*
  Prihlásenie appky v telefóne QR kódom z webu.

  Web vyrobí náhodný jednorazový token (32 bajtov), v databáze je len jeho
  SHA-256 a platí dve minúty. Appka ho naskenuje a vymení na serveri za
  reláciu toho istého človeka. QR kód nikoho nepridáva do firmy — appka
  potom vidí presne tie firmy, ktoré ten človek vidí na webe.

  Čisté funkcie bez servera, aby sa dali skúšať a použiť aj v appke.
*/

/** Predpona v QR kóde — nech sa kód nepletie s bločkom ani s platobným QR. */
export const PREDPONA_PAROVANIA = "FAKTERO-APP:";

/** Ako dlho platí kód na obrazovke. */
export const PLATNOST_PAROVANIA_MS = 2 * 60 * 1000;

/** Token je base64url z 32 bajtov — 43 znakov. */
const TVAR_TOKENU = /^[A-Za-z0-9_-]{43}$/;

export function kodParovania(token: string): string {
  return `${PREDPONA_PAROVANIA}${token}`;
}

/** Token z naskenovaného textu; `null`, keď to nie je kód Faktera. */
export function tokenZKodu(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s.toUpperCase().startsWith(PREDPONA_PAROVANIA)) return null;
  const token = s.slice(PREDPONA_PAROVANIA.length);
  return TVAR_TOKENU.test(token) ? token : null;
}

/** Je naskenovaný text kód na prihlásenie appky (aj keď poškodený)? */
export function jeKodParovania(raw: string | null | undefined): boolean {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .startsWith(PREDPONA_PAROVANIA);
}

/** Zostávajúce sekundy platnosti (na odpočet pri QR kóde). */
export function zostavaSekund(platneDo: string | number | Date, teraz = Date.now()): number {
  const t = new Date(platneDo).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.ceil((t - teraz) / 1000));
}
