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
      // `Style.Dark` = tmavé pozadie, teda **biele** hodiny a ikony. Znie to
      // naopak, ale plugin pomenúva pozadie, nie text; `Style.Light` by dal
      // čierny text a na zelenej by sa stratil.
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: ZELENA_HORE });

      /*
        Pás kreslí stránka (`PasHore`), preto WebView ide až pod hodiny — ale
        len na iOS. Android WebView hlási `env(safe-area-inset-top)` ako nulu aj
        vtedy, keď je appka roztiahnutá pod stavovú lištu; pás by mal nulovú
        výšku a obsah by liezol pod hodiny. Tam je lepšie nechať lištu mimo
        WebView a farbu na plugine — rozdelený pás pri otvorenom paneli tam
        vzniknúť nemôže, lebo panel sa pod lištu vôbec nedostane.
      */
      const { Capacitor } = await import("@capacitor/core");
      await StatusBar.setOverlaysWebView({ overlay: Capacitor.getPlatform() === "ios" });
    } catch (e) {
      console.warn("[native-init] StatusBar:", e);
    }

    /*
     * Push notifikácie — pri štarte sa len obnoví token, **nič sa nepýta**.
     *
     * iOS token vydá do sekundy po štarte a druhýkrát ten istý už nedá, takže
     * registrácia musí prebehnúť tu. Systémové okno o povolenie sa ale pýta až
     * domovská obrazovka (po prihlásení) — pri prvom otvorení by vyskočilo skôr,
     * než človek vie, čo appka robí, a „Nepovoliť" sa už nedá vziať späť.
     */
    try {
      const { registerPushNotifications } = await import("./push");
      registerPushNotifications({ pytatPovolenie: false }).catch((e) =>
        console.warn("[native-init] push:", e),
      );
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
