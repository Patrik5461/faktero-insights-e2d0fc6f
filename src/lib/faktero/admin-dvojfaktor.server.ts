/*
  Serverová polovica povinného 2FA pre administrátorov — viď admin-dvojfaktor.ts.
  Kontroly admina, ktoré čítajú `platform_admins` cez servisný kľúč (RLS ich
  neobmedzí), po overení roly volajú `vyzadujAal2Admina()`.
*/
import { getRequest } from "@tanstack/react-start/server";
import { adminSmie } from "./admin-dvojfaktor";

/**
 * Úroveň overenia (`aal`) z prístupového tokenu požiadavky. Podpis tokenu už
 * overil `requireSupabaseAuth` (getClaims) — tu sa len číta jeho obsah.
 */
export function aalZTokenu(authorization: string | null | undefined): string | null {
  const m = /^Bearer\s+[^.]+\.([^.]+)\./i.exec(authorization ?? "");
  if (!m) return null;
  try {
    const telo = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8"));
    return typeof telo?.aal === "string" ? telo.aal : null;
  } catch {
    return null;
  }
}

export const CHYBA_ADMIN_2FA =
  "Forbidden: administrácia vyžaduje dvojfaktorové overenie — zapnite ho v Nastavenia → Zabezpečenie účtu a prihláste sa s kódom.";

/** Hodí chybu, keď už je 2FA pre adminov povinné a relácia nie je aal2. */
export function vyzadujAal2Admina(teraz: Date = new Date()): void {
  let aal: string | null = null;
  try {
    aal = aalZTokenu(getRequest()?.headers.get("authorization"));
  } catch {
    aal = null;
  }
  if (!adminSmie(aal, teraz)) throw new Error(CHYBA_ADMIN_2FA);
}
