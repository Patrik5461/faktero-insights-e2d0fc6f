import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Samostatná aplikácia Kniha jázd.
 *
 * Vlastné `appId` znamená v obchode aj v telefóne samostatnú appku — vlastné
 * povolenia, vlastné úložisko, vlastný záznam v App Store Connect. Kód je
 * spoločný s Fakterom, líši sa len obal.
 */
const config: CapacitorConfig = {
  appId: "sk.tobify.knihajazd",
  appName: "Kniha jázd",
  webDir: "dist-jazdy",
  server: {
    androidScheme: "https",
  },
  ios: {
    // Vlastný natívny projekt vedľa toho Fakterovho. Bez tohto by si obe appky
    // prepisovali ten istý priečinok `ios/`.
    path: "ios-jazdy",
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
      backgroundColor: "#007e46",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      // Appka je svetlá, takže pás nad ňou musí byť tiež svetlý — inak sa pri
      // štarte mihne zelený a hodiny ostanú nečitateľné.
      style: "LIGHT",
      backgroundColor: "#f5f6f5",
      overlaysWebView: true,
    },
  },
};

export default config;
