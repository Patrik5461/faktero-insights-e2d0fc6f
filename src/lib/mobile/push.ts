/**
 * Push notification registration na natívnych zariadeniach.
 * Bezpečné na webe — všetko sa preskočí.
 */
import { supabase } from "@/integrations/supabase/client";

export async function registerPushNotifications(): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return { ok: false, error: "not native" };

    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    let granted = perm.receive === "granted";
    if (!granted) {
      const req = await PushNotifications.requestPermissions();
      granted = req.receive === "granted";
    }
    if (!granted) return { ok: false, error: "permission denied" };

    return await new Promise((resolve) => {
      const platform = Capacitor.getPlatform() as "ios" | "android";
      let resolved = false;
      const finish = (r: { ok: boolean; token?: string; error?: string }) => {
        if (resolved) return;
        resolved = true;
        resolve(r);
      };

      PushNotifications.addListener("registration", async (token) => {
        try {
          const { data: u } = await supabase.auth.getUser();
          if (u.user) {
            await supabase
              .from("profiles")
              .update({
                push_token: token.value,
                push_platform: platform,
                push_updated_at: new Date().toISOString(),
              } as any)
              .eq("id", u.user.id);
          }
          finish({ ok: true, token: token.value });
        } catch (e: any) {
          finish({ ok: false, error: e?.message ?? "save failed" });
        }
      });

      PushNotifications.addListener("registrationError", (err) => {
        finish({ ok: false, error: String(err?.error ?? err) });
      });

      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        try {
          const path = (action.notification.data as any)?.path;
          if (path && typeof window !== "undefined") window.location.assign(path);
        } catch {}
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
  } catch {}
}
