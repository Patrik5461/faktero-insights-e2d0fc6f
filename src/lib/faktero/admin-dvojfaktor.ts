/*
  Dvojfaktorové overenie pre administrátorov platformy (`platform_admins`).

  Do `ADMIN_2FA_POVINNE_OD` je to len výrazné upozornenie v /admin. Od toho
  dátumu sa do administrácie dostane len relácia s úrovňou aal2 (kód z
  overovacej appky zadaný po prihlásení):
  - web: `routes/admin.tsx` pošle admina bez aal2 na Nastavenia → Zabezpečenie
    účtu (tam si 2FA zapne — zapnutie admin práva nepotrebuje, takže sa nikto
    nezamkne),
  - server: `vyzadujAal2Admina()` v kontrolách admina cez servisný kľúč,
  - databáza: `is_platform_admin(auth.uid())` vráti pre aal1 reláciu false
    (migrácia `admin_dvojfaktor_povinny`, ten istý dátum).
  Dátum je napevno aj v migrácii — pri zmene treba oba.
*/

/** 8. 11. 2026 00:00 SEČ — 7 dní od nasadenia (31. 10. 2026). */
export const ADMIN_2FA_POVINNE_OD = "2026-11-08T00:00:00+01:00";

export function adminDvojfaktorPovinny(teraz: Date = new Date()): boolean {
  return teraz.getTime() >= new Date(ADMIN_2FA_POVINNE_OD).getTime();
}

/** Koľko celých dní ostáva do povinnosti (0 = už platí). */
export function dniDoPovinnosti(teraz: Date = new Date()): number {
  const ms = new Date(ADMIN_2FA_POVINNE_OD).getTime() - teraz.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

/** Smie relácia s touto úrovňou do administrácie? */
export function adminSmie(aal: string | null | undefined, teraz: Date = new Date()): boolean {
  return aal === "aal2" || !adminDvojfaktorPovinny(teraz);
}
