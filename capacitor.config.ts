import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "sk.faktero.app",
  appName: "Faktero",
  // SSR app — appka načítava živú web verziu. Bez `webDir` nutného pre `cap sync`
  // používame placeholder; reálne renderovanie ide cez `server.url`.
  webDir: ".output/public",
  server: {
    // Appka otvára rovno mobilný tok: prihlásenie → firma → skenovanie.
    // Webová aplikácia je na tom istom mieste, len sa do nej z telefónu
    // nechodí — na malej obrazovke je neovládateľná.
    url: "https://www.faktero.sk/app",
    cleartext: false,
    androidScheme: "https",
    errorPath: "/app",
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
      launchAutoHide: false,
      backgroundColor: "#10b981",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#10b981",
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
