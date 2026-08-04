/**
 * Biometrické prihlásenie (Face ID / Touch ID / Android Biometric).
 * Bezpečné na webe — vždy vráti { available: false }.
 *
 * Tok: po úspešnom prvom prihlásení používateľa uložíme Supabase session
 * (refresh_token) do "biometric vault" cez nativ. Pri ďalšom spustení appky
 * zavoláme `authenticate()` → odomkne sa → načítame token → `supabase.auth.setSession()`.
 */
import { supabase } from "@/integrations/supabase/client";

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
    const { Preferences } = await import("@capacitor/preferences").catch(() => ({
      Preferences: null as any,
    }));
    const payload = JSON.stringify({
      refresh_token: data.session.refresh_token,
      access_token: data.session.access_token,
      saved_at: Date.now(),
    });
    if (Preferences) {
      await Preferences.set({ key: STORAGE_KEY, value: payload });
    } else {
      localStorage.setItem(STORAGE_KEY, payload);
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Chyba biometrie" };
  }
}

export async function disableBiometric(): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences").catch(() => ({
      Preferences: null as any,
    }));
    if (Preferences) await Preferences.remove({ key: STORAGE_KEY });
  } catch {}
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
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
    const { Preferences } = await import("@capacitor/preferences").catch(() => ({
      Preferences: null as any,
    }));
    let raw: string | null = null;
    if (Preferences) {
      const r = await Preferences.get({ key: STORAGE_KEY });
      raw = r.value;
    } else {
      raw = localStorage.getItem(STORAGE_KEY);
    }
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
