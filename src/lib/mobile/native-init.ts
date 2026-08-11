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

    /*
     * Status bar — pás pod hodinami musí mať presne farbu hlavičky.
     *
     * Farba sa nastavuje na oboch platformách, nielen na Androide: iOS má od
     * Capacitora 8 vlastný podklad status baru a berie si farbu z konfigurácie
     * zabudovanej do buildu. Kým sa nastavovala len na Androide, na iPhone
     * ostávala tá, s ktorou bola appka zostavená — po zmene značkovej zelenej
     * tam preto svietil svetlejší pás, ktorý sa dal opraviť len novým buildom.
     * Takto sa farba dorovná pri každom štarte z webu.
     */
    try {
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      const { ZELENA_HORE } = await import("./brand");
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: ZELENA_HORE });
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
