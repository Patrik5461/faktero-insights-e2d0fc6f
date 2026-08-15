/**
 * Biometrické prihlásenie (Face ID / Touch ID / Android Biometric).
 * Bezpečné na webe — vždy vráti { available: false }.
 *
 * Tok: po úspešnom prvom prihlásení používateľa uložíme Supabase session
 * (refresh_token) do "biometric vault" cez nativ. Pri ďalšom spustení appky
 * zavoláme `authenticate()` → odomkne sa → načítame token → `supabase.auth.setSession()`.
 */
import { supabase } from "@/integrations/supabase/client";
import { trvaleUlozisko } from "./trvale-ulozisko";

const STORAGE_KEY = "faktero.biometric.session.v1";

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return false;
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    const info = await BiometricAuth.checkBiometry();
    return Boolean(info.isAvailable);
  } catch {
    return false;
  }
}

export async function enableBiometric(): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(await isBiometricAvailable())) return { ok: false, error: "Biometria nie je dostupná" };
    const { data } = await supabase.auth.getSession();
    if (!data.session?.refresh_token) return { ok: false, error: "Najskôr sa prihláste" };
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    await BiometricAuth.authenticate({
      reason: "Povoliť rýchle prihlásenie do Faktero",
      cancelTitle: "Zrušiť",
      androidTitle: "Faktero",
      androidSubtitle: "Povoliť biometriu",
    });
    const payload = JSON.stringify({
      refresh_token: data.session.refresh_token,
      access_token: data.session.access_token,
      saved_at: Date.now(),
    });
    // Cez trvalé úložisko, ktoré citlivé kľúče odkladá do Keychainu — je to
    // prístup k účtu, nie nastavenie.
    await trvaleUlozisko.setItem(STORAGE_KEY, payload);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Chyba biometrie" };
  }
}

/** Je rýchle prihlásenie zapnuté? Prepínač v nastaveniach musí vedieť, čo ukázať. */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    return !!(await trvaleUlozisko.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export async function disableBiometric(): Promise<void> {
  // Maže naraz v Keychaine aj v starších miestach, kde token mohol ostať z
  // predchádzajúcich verzií.
  await trvaleUlozisko.removeItem(STORAGE_KEY).catch(() => {});
}

export async function loginWithBiometric(): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(await isBiometricAvailable())) return { ok: false, error: "Biometria nie je dostupná" };
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    await BiometricAuth.authenticate({
      reason: "Prihlásenie do Faktero",
      cancelTitle: "Zrušiť",
      androidTitle: "Faktero",
      androidSubtitle: "Prihlásiť sa biometriou",
    });
    const raw = await trvaleUlozisko.getItem(STORAGE_KEY);
    if (!raw) return { ok: false, error: "Biometria nie je nakonfigurovaná" };
    const parsed = JSON.parse(raw) as { refresh_token: string; access_token: string };
    const { error } = await supabase.auth.setSession({
      refresh_token: parsed.refresh_token,
      access_token: parsed.access_token,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Biometria zlyhala" };
  }
}

/**
 * Overenie totožnosti bez prihlasovania.
 *
 * Používa sa na zámok pri návrate do appky: relácia je platná, len treba
 * potvrdiť, že telefón drží ten istý človek. Preto sa tu — na rozdiel od
 * `loginWithBiometric` — nesiaha na uloženú reláciu.
 */
export async function overBiometriu(): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(await isBiometricAvailable())) return { ok: false, error: "Biometria nie je dostupná" };
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    await BiometricAuth.authenticate({
      reason: "Odomknutie Faktera",
      cancelTitle: "Zrušiť",
      androidTitle: "Faktero",
      androidSubtitle: "Odomknúť aplikáciu",
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Odomknutie zlyhalo" };
  }
}
