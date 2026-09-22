/*
  Dvojfaktorové overenie (TOTP) — dobrovoľné, kto chce, zapne si ho v
  Nastaveniach → Zabezpečenie účtu. Kód generuje overovacia appka (Google
  Authenticator, Microsoft Authenticator, 1Password…). Databáza s ním počíta
  cez `public.mfa_ok()`: kto má overenie zapnuté, k dátam sa bez kódu
  nedostane, ani keby niekto poznal jeho heslo.
*/
import { supabase } from "@/integrations/supabase/client";

/** Kód z appky: 6 číslic, medzery a pomlčky sa ignorujú. */
export function upravKod(vstup: string): string | null {
  const k = vstup.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(k) ? k : null;
}

/** Má prihlásený človek overenie zapnuté, ale táto relácia ešte kód nezadala? */
export async function potrebujeKod(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
  } catch {
    return false;
  }
}

export async function overenyFaktor() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  return data?.totp?.find((f) => f.status === "verified") ?? null;
}

/** Overí kód pri prihlásení; relácia potom má úroveň aal2. */
export async function overKod(vstup: string): Promise<void> {
  const kod = upravKod(vstup);
  if (!kod) throw new Error("Zadajte 6-miestny kód z overovacej appky.");
  const faktor = await overenyFaktor();
  if (!faktor) throw new Error("Dvojfaktorové overenie nie je zapnuté.");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: faktor.id, code: kod });
  if (error) throw new Error(prelozChybuKodu(error.message));
}

export function prelozChybuKodu(sprava: string): string {
  const n = sprava.toLowerCase();
  if (n.includes("invalid") || n.includes("expired")) return "Kód nesedí alebo už vypršal. Zadajte aktuálny kód z appky.";
  if (n.includes("rate") || n.includes("too many")) return "Priveľa pokusov. Skúste to o chvíľu.";
  return sprava;
}

/**
 * Začne zapínanie: založí faktor a vráti QR kód a tajný kľúč na ručné
 * zadanie. Nedokončený faktor z predošlého pokusu sa najprv odstráni —
 * inak by nový nešiel založiť.
 */
export async function zacniZapinanie(): Promise<{ factorId: string; qr: string; tajomstvo: string }> {
  const { data: zoznam } = await supabase.auth.mfa.listFactors();
  for (const f of zoznam?.all ?? []) {
    if (f.factor_type === "totp" && f.status !== "verified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Faktero ${new Date().toISOString().slice(0, 10)}`,
    issuer: "Faktero",
  });
  if (error || !data) throw new Error(error?.message ?? "Zapnutie sa nepodarilo.");
  return { factorId: data.id, qr: data.totp.qr_code, tajomstvo: data.totp.secret };
}

export async function dokonciZapinanie(factorId: string, vstup: string): Promise<void> {
  const kod = upravKod(vstup);
  if (!kod) throw new Error("Zadajte 6-miestny kód z overovacej appky.");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: kod });
  if (error) throw new Error(prelozChybuKodu(error.message));
}

/** Vypnutie. Supabase ho pustí len relácii, ktorá kód zadala (aal2). */
export async function vypni(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw new Error(error.message);
  // Relácia sa obnoví, nech sa v nej prejaví, že overenie už nie je.
  await supabase.auth.refreshSession();
}
