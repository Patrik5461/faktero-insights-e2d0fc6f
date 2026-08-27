/**
 * Push notification registration na natívnych zariadeniach.
 * Bezpečné na webe — všetko sa preskočí.
 */
import { supabase } from "@/integrations/supabase/client";
import { citaj, zapis, zmaz } from "./trvale-ulozisko";

/**
 * Token, ktorý dorazil skôr, než bol používateľ prihlásený.
 *
 * iOS vydá token do sekundy po štarte appky, kým prihlásenie môže trvať oveľa
 * dlhšie (alebo sa deje až potom). Dovtedy sa token ticho zahadzoval a druhý raz
 * ho iOS už nevydá — appka teda vyzerala zaregistrovaná, ale server nemal kam
 * posielať. Preto sa odloží a doručí, keď je session známa.
 */
const CAKAJUCI = "faktero.push.cakajuci";

function odlozToken(token: string, platform: string): void {
  try {
    zapis(CAKAJUCI, JSON.stringify({ token, platform }));
  } catch {
    /* súkromný režim — token sa doručí pri ďalšom štarte */
  }
}

async function zapisToken(token: string, platform: string): Promise<boolean> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return false;
  const { error } = await supabase
    .from("profiles")
    .update({
      push_token: token,
      push_platform: platform,
      push_updated_at: new Date().toISOString(),
    } as any)
    .eq("id", u.user.id);
  return !error;
}

/**
 * Doručí odložený token. Volá sa vždy, keď appka vie, kto je prihlásený —
 * pri štarte aj hneď po prihlásení.
 */
export async function dorucCakajuciPushToken(): Promise<void> {
  try {
    const raw = citaj(CAKAJUCI);
    if (!raw) return;
    const { token, platform } = JSON.parse(raw) as { token: string; platform: string };
    if (!token) return;
    if (await zapisToken(token, platform)) zmaz(CAKAJUCI);
  } catch (e) {
    console.warn("[push] odložený token sa nepodarilo doručiť", e);
  }
}

/**
 * Registrácia u Apple, prípadne aj so systémovým oknom o povolenie.
 *
 * `pytatPovolenie: false` je pre štart appky: token sa obnoví, keď je
 * povolenie už dané, ale nikoho sa nič nepýta. Systémové okno vyskakovalo pri
 * prvom otvorení, teda skôr, než človek vôbec vedel, čo appka robí — a kto
 * vtedy ťukol „Nepovoliť", mal push nadobro vypnutý, lebo iOS sa druhýkrát
 * nepýta a zapnúť sa to dá už len v nastaveniach telefónu. Pýta sa preto až
 * domovská obrazovka, teda po prihlásení.
 */
export async function registerPushNotifications({
  pytatPovolenie = true,
}: { pytatPovolenie?: boolean } = {}): Promise<{
  ok: boolean;
  token?: string;
  error?: string;
}> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return { ok: false, error: "not native" };

    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    let granted = perm.receive === "granted";
    if (!granted) {
      if (!pytatPovolenie) return { ok: false, error: "permission not requested" };
      const req = await PushNotifications.requestPermissions();
      granted = req.receive === "granted";
    }
    if (!granted) return { ok: false, error: "permission denied" };

    return await new Promise((resolve) => {
      const platform = Capacitor.getPlatform() as "ios" | "android";
      let resolved = false;
      const odpoj: Array<() => void> = [];
      /*
       * iOS odpovie na registráciu do sekundy. Keď sa neozve nič, sľub tu kedysi
       * čakal navždy a tlačidlo v Účte sa donekonečna točilo — chyba bola pritom
       * v natívnej časti (chýbajúce metódy v AppDelegate). Radšej to po chvíli
       * vzdať a povedať to nahlas.
       */
      const cas = setTimeout(
        () => finish({ ok: false, error: "iOS na registráciu neodpovedal (30 s)" }),
        30_000,
      );

      function finish(r: { ok: boolean; token?: string; error?: string }) {
        if (resolved) return;
        resolved = true;
        clearTimeout(cas);
        // Bez odpojenia by každé ďalšie ťuknutie na „Skúsiť znova" pridalo
        // ďalšiu kópiu poslucháčov a token by sa zapisoval viackrát.
        odpoj.forEach((f) => f());
        resolve(r);
      }

      /** Podrží poslucháča, aby sa dal po dokončení odpojiť. */
      const drz = (p: Promise<{ remove: () => Promise<void> }>) => {
        p.then((h) => {
          if (resolved) void h.remove();
          else odpoj.push(() => void h.remove());
        }).catch(() => {
          /* poslucháča sa nepodarilo napojiť — vyrieši to časový limit */
        });
      };

      drz(
        PushNotifications.addListener("registration", async (token) => {
          try {
            // Keď ešte nikto nie je prihlásený, token sa odloží — zahodiť ho
            // znamená, že server o zariadení nikdy nebude vedieť.
            if (!(await zapisToken(token.value, platform))) odlozToken(token.value, platform);
            finish({ ok: true, token: token.value });
          } catch (e: any) {
            odlozToken(token.value, platform);
            finish({ ok: false, error: e?.message ?? "save failed" });
          }
        }),
      );

      drz(
        PushNotifications.addListener("registrationError", (err) => {
          finish({ ok: false, error: String(err?.error ?? err) });
        }),
      );

      // Tento ostáva napojený aj po dokončení — otvára cieľ ťuknutej notifikácie.
      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        try {
          const path = (action.notification.data as any)?.path;
          if (path && typeof window !== "undefined") window.location.assign(path);
        } catch {
          // poškodená data.path v notifikácii nesmie zhodiť handler
        }
      });

      PushNotifications.register().catch((e) => finish({ ok: false, error: e?.message }));
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "push init failed" };
  }
}

export async function unregisterPush(): Promise<void> {
  try {
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      await supabase
        .from("profiles")
        .update({ push_token: null, push_platform: null } as any)
        .eq("id", u.user.id);
    }
  } catch (e) {
    console.warn(
      "[push] odhlásenie tokenu zlyhalo — zariadenie môže ďalej dostávať notifikácie",
      e,
    );
  }
}
