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

/*
  Android sa zatiaľ sťahuje z webu ako APK — v Google Play appka ešte nie je.
  Súbory sú vo verejnom kbelíku `android` v Supabase, s verziou v názve, aby
  sa nová verzia nikdy nezamenila so starou z vyrovnávacej pamäte. Nový build:
  nahrať APK pod novým názvom a prepísať verziu, veľkosť a odtlačok tu aj
  `android` v `public/mobil-verzia.json` (inak appke aktualizáciu neponúkne).
*/
const ANDROID_KBELIK = "https://sywcjxydnljkzoepfcaz.supabase.co/storage/v1/object/public/android";

export type AndroidApk = {
  nazov: string;
  verzia: string;
  subor: string;
  /** Veľkosť v MB, zaokrúhlená. */
  mb: number;
  sha256: string;
  url: string;
};

const apk = (
  nazov: string,
  verzia: string,
  subor: string,
  mb: number,
  sha256: string,
): AndroidApk => ({
  nazov,
  verzia,
  subor,
  mb,
  sha256,
  url: `${ANDROID_KBELIK}/${subor}?download=${subor}`,
});

/** Stránka so stiahnutím a návodom na inštaláciu. */
export const ANDROID_STRANKA = "/android";

export const ANDROID_FAKTERO = apk(
  "Faktero",
  "1.6.7",
  "faktero-1.6.7.apk",
  16,
  "a39365cd9904b4a8c233d5eb8357a4823d6c8be215e4976d966ecd0582b9cad9",
);

export const ANDROID_KNIHA_JAZD = apk(
  "Kniha jázd",
  "1.0.4",
  "kniha-jazd-1.0.4.apk",
  8,
  "56d13867ad50f232936c2b2aa84e3cdc2037a63ec917660f9096adbfe8228a65",
);

/** Odtlačok podpisového certifikátu — rovnaký pre obe appky. */
export const ANDROID_PODPIS_SHA256 =
  "77:42:58:6C:61:9F:3B:D9:45:58:60:50:DE:45:7E:FF:BB:82:F7:C6:BB:FF:BC:2D:A9:B4:4A:92:AA:04:4A:EB";
