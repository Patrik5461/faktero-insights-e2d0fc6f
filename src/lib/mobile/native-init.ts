/**
 * Inicializácia natívnych Capacitor pluginov pri štarte appky.
 * Spúšťať z `useEffect` v root layoute. Bezpečné na webe — všetko sa preskočí.
 */
export async function initNativePlatform(): Promise<void> {
  // Offline queue listeners — fungujú aj na webe (PWA)
  try {
    const { initOfflineSync } = await import("./offline-queue");
    initOfflineSync();
  } catch {
    // offline queue je best-effort — bez nej appka funguje online
  }

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    // Status bar — zelená brand farba
    try {
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      await StatusBar.setStyle({ style: Style.Dark });
      if (Capacitor.getPlatform() === "android") {
        await StatusBar.setBackgroundColor({ color: "#10b981" });
      }
      await StatusBar.setOverlaysWebView({ overlay: false });
    } catch (e) {
      console.warn("[native-init] StatusBar:", e);
    }

    // Push notifikácie — registrácia tokenu po prihlásení
    try {
      const { registerPushNotifications } = await import("./push");
      registerPushNotifications().catch((e) => console.warn("[native-init] push:", e));
    } catch {
      // push moduly nie sú vo webovom builde; chyby registrácie loguje sám modul
    }

    // Splash screen — schovať po načítaní web obsahu
    try {
      const { SplashScreen } = await import("@capacitor/splash-screen");
      await SplashScreen.hide({ fadeOutDuration: 250 });
    } catch (e) {
      console.warn("[native-init] SplashScreen:", e);
    }

    // Deep linking — faktero://faktury/<id> → navigácia v appke
    try {
      const { App } = await import("@capacitor/app");
      App.addListener("appUrlOpen", (event) => {
        try {
          const url = new URL(event.url);
          const path = url.pathname || "/";
          if (typeof window !== "undefined") {
            window.location.assign(path + url.search);
          }
        } catch {
          // poškodený deep link nesmie zhodiť handler — používateľ zostane tam, kde je
        }
      });
    } catch (e) {
      console.warn("[native-init] App deep links:", e);
    }
  } catch {
    // capacitor not available (web prod build)
  }
}
