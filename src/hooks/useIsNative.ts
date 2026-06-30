import { useEffect, useState } from "react";

/**
 * Vráti `true` len v natívnej Capacitor appke (iOS/Android), nie vo web prehliadači.
 * Bezpečné pri SSR — počas servera vždy `false`, po hydratácii sa upresní.
 */
export function useIsNative(): boolean {
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!cancelled) setIsNative(Capacitor.isNativePlatform());
      } catch {
        // package missing or SSR — keep false
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return isNative;
}

export function useNativePlatform(): "ios" | "android" | "web" {
  const [platform, setPlatform] = useState<"ios" | "android" | "web">("web");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!cancelled) setPlatform(Capacitor.getPlatform() as any);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);
  return platform;
}
