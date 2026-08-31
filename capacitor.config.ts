import type { CapacitorConfig } from "@capacitor/cli";
import knihaJazd from "./capacitor.config.jazdy";

const faktero: CapacitorConfig = {
  appId: "sk.tobify.faktero",
  appName: "Faktero",
  // Appka má rozhranie v sebe (build z `vite.config.mobile.ts`), takže sa otvorí
  // aj bez signálu. Dovtedy sa ťahalo zo živého webu cez `server.url` a bez
  // pripojenia sa nedalo spraviť nič.
  webDir: "dist-mobile",
  /*
    Podklad WebView.

    Bez tejto hodnoty si ho Capacitor nastaví na `UIColor.systemBackground` —
    teda na telefóne v nočnom režime na **čiernu**. Appka je pritom svetlá, a
    tak každý kúsok, ktorý sa na okamih odkryje (prepočet výšky pri prepnutí
    záložky, dobiehajúce prekreslenie), blysne čiernym pásom pri spodnom
    okraji. Musí sedieť s `--app-pozadie` v `styles.css` a s `POZADIE_APKY`
    v `src/lib/mobile/brand.ts`.
  */
  backgroundColor: "#f5f6f5",
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

/**
 * Dve appky, jeden repozitár.
 *
 * Capacitor CLI číta vždy len tento súbor — vlastný `--config` nemá. Voľbu
 * appky preto nesie premenná prostredia: `CAPACITOR_APP=jazdy npx cap sync`
 * pracuje s Knihou jázd a jej projektom v `ios-jazdy`. Bez premennej je to
 * Faktero, takže doterajšie príkazy robia presne to, čo robili.
 */
export default process.env.CAPACITOR_APP === "jazdy" ? knihaJazd : faktero;
