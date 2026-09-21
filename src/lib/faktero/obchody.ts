/**
 * Odkazy do obchodov s aplikáciami.
 *
 * Na jednom mieste, lebo ich používa úvodná stránka aj návod k appke — a keď
 * sa raz zmenia (napríklad pribudne Google Play), nesmie jeden z nich ostať
 * visieť na starom. Odkaz pre samotnú appku (výzva na aktualizáciu) je v
 * `public/mobil-verzia.json`, lebo ho appka číta zo servera.
 */

/** Faktero v App Store. Slovenský obchod; Apple človeka presmeruje na ten jeho. */
export const APP_STORE_FAKTERO = "https://apps.apple.com/sk/app/faktero/id6802420128";

/** Kniha jázd v App Store — samostatná appka len na jazdy. */
export const APP_STORE_KNIHA_JAZD = "https://apps.apple.com/sk/app/kniha-jazd-faktero/id6806653930";

/**
 * Oficiálny odznak „Download on the App Store“ od Apple. Vlastné napodobeniny
 * pravidlá Apple nedovoľujú; slovenská verzia odznaku sa zo servera stiahnuť
 * nedala, anglická je povolená všade.
 */
export const APP_STORE_ODZNAK = "/app-store-odznak.svg";
