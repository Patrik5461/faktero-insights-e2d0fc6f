import { useEffect } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Iba v natívnej Capacitor appke: neukazuj marketing/landing.
 * - Ak je aktuálna cesta "/" alebo iná marketingová stránka → presmeruj
 *   na `/dashboard` (ak je user prihlásený) alebo `/prihlasenie`.
 * - Na webe (browser) nerobí nič.
 */
const MARKETING_PREFIXES = [
  "/", "/cennik", "/funkcie", "/efakturacia", "/blog", "/pomoc", "/pravne",
  "/uctovnici", "/vyvojari", "/docs",
];

function isMarketingPath(p: string): boolean {
  if (p === "/") return true;
  return MARKETING_PREFIXES.some((prefix) => prefix !== "/" && (p === prefix || p.startsWith(prefix + "/")));
}

export function NativeRouteGuard() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        if (!isMarketingPath(pathname)) return;
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        const target = data.session?.user ? "/dashboard" : "/prihlasenie";
        router.navigate({ to: target as any, replace: true });
      } catch {
        // capacitor not available — noop
      }
    })();
    return () => { cancelled = true; };
  }, [pathname, router]);

  return null;
}
