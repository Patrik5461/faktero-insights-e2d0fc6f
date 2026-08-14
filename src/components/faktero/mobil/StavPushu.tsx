import { useEffect, useState } from "react";
import { Bell, Check, TriangleAlert, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Stav push notifikácií v účte.
 *
 * Registrácia sa deje na pozadí a keď zlyhá, dozvie sa to len konzola — čo je
 * na telefóne bez pripojeného Macu nedostupné. Preto je tu vidieť, či token
 * naozaj dorazil na server, a tlačidlo, ktorým sa registrácia zopakuje.
 */
export function StavPushu() {
  const [stav, setStav] = useState<{
    povolenie?: string;
    naServeri?: boolean;
    chyba?: string | null;
  } | null>(null);
  const [pracujem, setPracujem] = useState(false);

  async function zisti() {
    const vysledok: { povolenie?: string; naServeri?: boolean; chyba?: string | null } = {};
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) {
        vysledok.povolenie = "len v mobilnej aplikácii";
      } else {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        vysledok.povolenie = (await PushNotifications.checkPermissions()).receive;
      }
    } catch (e: any) {
      vysledok.chyba = e?.message ?? "plugin nedostupný";
    }
    try {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data } = await supabase
          .from("profiles")
          .select("push_token")
          .eq("id", u.user.id)
          .maybeSingle();
        vysledok.naServeri = Boolean((data as any)?.push_token);
      }
    } catch {
      /* stav zo servera nie je kritický */
    }
    setStav(vysledok);
  }

  useEffect(() => {
    zisti();
  }, []);

  async function zopakuj() {
    setPracujem(true);
    try {
      const { registerPushNotifications, dorucCakajuciPushToken } = await import(
        "@/lib/mobile/push"
      );
      const r = await registerPushNotifications();
      await dorucCakajuciPushToken();
      await zisti();
      if (!r.ok) setStav((s) => ({ ...(s ?? {}), chyba: r.error ?? "registrácia zlyhala" }));
    } catch (e: any) {
      setStav((s) => ({ ...(s ?? {}), chyba: e?.message ?? "registrácia zlyhala" }));
    } finally {
      setPracujem(false);
    }
  }

  const hotovo = stav?.naServeri === true;

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Bell className="h-4 w-4 text-primary" /> Notifikácie
      </div>

      {stav === null ? (
        <div className="mt-2 text-[13px] text-muted-foreground">Zisťujem…</div>
      ) : (
        <div className="mt-2 space-y-1 text-[13px]">
          <div className="flex items-center gap-2">
            {hotovo ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" />
            )}
            <span>
              {hotovo
                ? "Zariadenie je zaregistrované, notifikácie chodiť budú."
                : "Server toto zariadenie zatiaľ nepozná."}
            </span>
          </div>
          <div className="text-muted-foreground">
            Povolenie v telefóne: <span className="font-medium">{stav.povolenie ?? "?"}</span>
          </div>
          {stav.chyba && <div className="text-destructive">Chyba: {stav.chyba}</div>}
        </div>
      )}

      <button
        onClick={zopakuj}
        disabled={pracujem}
        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-[14px] disabled:opacity-60"
      >
        {pracujem && <Loader2 className="h-4 w-4 animate-spin" />}
        {hotovo ? "Zaregistrovať znova" : "Skúsiť zaregistrovať"}
      </button>
    </div>
  );
}
