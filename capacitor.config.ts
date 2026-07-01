import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "sk.faktero.app",
  appName: "Faktero",
  // SSR app — appka načítava živú web verziu. Bez `webDir` nutného pre `cap sync`
  // používame placeholder; reálne renderovanie ide cez `server.url`.
  webDir: ".output/public",
  server: {
    url: "https://www.faktero.sk",
    cleartext: false,
    androidScheme: "https",
    errorPath: "/prihlasenie",
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
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
