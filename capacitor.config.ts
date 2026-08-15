import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "sk.faktero.app",
  appName: "Faktero",
  // Appka má rozhranie v sebe (build z `vite.config.mobile.ts`), takže sa otvorí
  // aj bez signálu. Dovtedy sa ťahalo zo živého webu cez `server.url` a bez
  // pripojenia sa nedalo spraviť nič.
  webDir: "dist-mobile",
  server: {
    androidScheme: "https",
  },
  ios: {
    // Bez `never` si WebView pridá vlastné odsadenie a bije sa s odsadením
    // pre výrez, ktoré si stránka rieši sama cez `env(safe-area-inset-*)`.
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
    scrollEnabled: true,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      // Splash schováva webová vrstva až po načítaní. Bez signálu sa nenačíta
      // nikdy, takže ju schová aj offline obrazovka — viď scripts/build-mobile-shell.mjs.
      launchAutoHide: false,
      backgroundColor: "#007e46",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      // Musí sedieť so `ZELENA_HORE` v `src/lib/mobile/brand.ts` — táto hodnota
      // sa zapečie do buildu, tá druhá sa nastavuje pri každom štarte z webu.
      backgroundColor: "#007e46",
      // WebView siaha až pod hodiny a pás nad ním kreslí stránka (`PasHore`).
      // Keď ho kreslil plugin, pri otvorenom bočnom paneli sa pás rozdelil:
      // nad panelom ostal zelený, vedľa neho ho stmavilo prekrytie panela.
      overlaysWebView: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
