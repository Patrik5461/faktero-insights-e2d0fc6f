/*
  Systémový skener dokumentov.

  Doklad sa dovtedy fotil obyčajným fotoaparátom (`@capacitor/camera`) — na
  fotke bol aj stôl, prsty a tieň, doklad šikmo a AI aj účtovník čítali to,
  čo z neho ostalo. Telefón pritom vie lepšie: iOS má skener vo VisionKite,
  Android v Google Play službách (ML Kit Document Scanner). Oba nájdu okraje
  dokladu, vyrovnajú perspektívu, dovolia doladiť rohy, ponúknu filtre a
  naskenujú aj viac strán za sebou. Plugin `@capgo/capacitor-document-scanner`
  ich len otvorí — obrázky ostávajú v telefóne, kým ich appka sama nenahrá.

  Kde skener nie je (web `/app`, Android bez Play služieb, emulátor, chyba
  pluginu), ide sa po starom cez `captureReceipt` — fotoaparát alebo výber
  súboru. Zrušenie skenera je iná vec než nedostupný skener: človek si to
  rozmyslel, takže sa nič neotvára znova a nič sa nehlási.

  Do Knihy jázd plugin nepatrí — `capacitor.config.jazdy.ts` má vlastný
  `includePlugins` a skener v ňom nie je.
*/

import { captureReceipt } from "./receipt-scanner";
import { velkostDataUrl, MAX_VELKOST_B } from "./davka-dokladov";

/** Kvalita JPEG zo skenera. Text ostane ostrý a strana má bežne pod 1,5 MB. */
export const KVALITA_SKENU = 80;
/** Koľko strán unesie jedno skenovanie (Android ML Kit má strop 24). */
export const MAX_STRAN = 20;
/**
 * Rozpočet na jeden doklad pred nahratím. Server berie 15 MB na súbor
 * (`MAX_VELKOST_B`); PDF zo strán pridá pár kilobajtov a nechávame si rezervu.
 */
export const ROZPOCET_DOKLADU_B = MAX_VELKOST_B - 1024 * 1024;

export type MoznostiSkenera = {
  croppedImageQuality: number;
  responseType: "base64";
  letUserAdjustCrop: boolean;
  maxNumDocuments?: number;
  scannerMode?: "base" | "base_with_filter" | "full";
};

/**
 * Nastavenie skenera podľa platformy.
 *
 * Android: `full` = orezanie, otočenie, filtre aj čistenie (škvrny, prsty);
 * počet strán sa dá obmedziť priamo v ML Kite.
 *
 * iOS: `letUserAdjustCrop` ani `maxNumDocuments` sa neposielajú. Plugin by
 * kvôli nim zapol vlastný náhľad cez neverejné časti VisionKitu (swizzling
 * `VNDocumentCameraViewController_InProcess`) — to je riziko pri kontrole v
 * App Store a pri každej novej verzii iOS. Bez nich ostáva čistý systémový
 * skener, ktorý rohy aj filtre vie upraviť sám (ťuknutím na náhľad strany).
 * Jednu stranu si preto na iOS vyberieme až z výsledku.
 */
export function moznostiSkenera(platforma: string, jednaStrana: boolean): MoznostiSkenera {
  const spolocne = { croppedImageQuality: KVALITA_SKENU, responseType: "base64" as const };
  if (platforma === "ios") return { ...spolocne, letUserAdjustCrop: false };
  return {
    ...spolocne,
    letUserAdjustCrop: true,
    scannerMode: "full",
    maxNumDocuments: jednaStrana ? 1 : MAX_STRAN,
  };
}

/** Plugin vracia čisté base64 (bez hlavičky) — appka všade pracuje s data URL. */
export function naDataUrl(obrazok: string): string {
  const s = obrazok.trim();
  if (s.startsWith("data:")) return s;
  return `data:image/jpeg;base64,${s}`;
}

/**
 * Treba strany zmenšiť, aby sa doklad zmestil do limitu nahrávania?
 *
 * Bežný sken má pri kvalite 80 okolo 1 MB na stranu, takže zmenšuje sa len
 * výnimočne — dlhý doklad o desiatkach strán alebo telefón s obrovským
 * snímačom. Kvalita sa radšej nechá, kým netreba.
 */
export function trebaZmensit(velkosti: number[], rozpocet = ROZPOCET_DOKLADU_B): boolean {
  return velkosti.reduce((s, v) => s + v, 0) > rozpocet;
}

/**
 * Najdlhšia strana obrázka tak, aby sa všetky strany zmestili do rozpočtu.
 * Plocha (a zhruba aj veľkosť JPEG) rastie so štvorcom strany.
 */
export function cielovaStrana(spolu: number, rozpocet: number, dnes: number): number {
  if (spolu <= rozpocet) return dnes;
  const pomer = Math.sqrt(rozpocet / spolu) * 0.9;
  return Math.max(1000, Math.floor(dnes * pomer));
}

async function zmensiObrazok(dataUrl: string, maxStrana: number): Promise<string> {
  const img = new Image();
  await new Promise<void>((ok, chyba) => {
    img.onload = () => ok();
    img.onerror = () => chyba(new Error("obrázok sa nenačítal"));
    img.src = dataUrl;
  });
  const dlhsia = Math.max(img.naturalWidth, img.naturalHeight);
  if (!dlhsia || dlhsia <= maxStrana) return dataUrl;
  const k = maxStrana / dlhsia;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * k);
  canvas.height = Math.round(img.naturalHeight * k);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", KVALITA_SKENU / 100);
}

/**
 * Zmenší strany jedného dokladu, len keď spolu presahujú limit nahrávania.
 * Keď sa zmenšiť nedá (chyba plátna), vráti ich bez zmeny — príliš veľký
 * doklad potom odmietne nahratie s jasnou hláškou, nič sa potichu nestratí.
 */
export async function zmestiDoLimitu(strany: string[]): Promise<string[]> {
  const velkosti = strany.map(velkostDataUrl);
  if (!trebaZmensit(velkosti)) return strany;
  const spolu = velkosti.reduce((s, v) => s + v, 0);
  try {
    // 3000 px je dlhšia strana bežného skenu A4 — odtiaľ sa ide dole.
    const strana = cielovaStrana(spolu, ROZPOCET_DOKLADU_B, 3000);
    return await Promise.all(strany.map((s) => zmensiObrazok(s, strana)));
  } catch {
    return strany;
  }
}

export type VysledokSkenera =
  { stav: "ok"; strany: string[] } | { stav: "zrusene" } | { stav: "nedostupny"; dovod?: string };

/** Otvorí systémový skener. Nič iné neskúša — to robí `zachytStrany`. */
export async function naskenujSystemom(jednaStrana: boolean): Promise<VysledokSkenera> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("DocumentScanner"))
      return { stav: "nedostupny" };
    const { DocumentScanner } = await import("@capgo/capacitor-document-scanner");
    // Plugin má na režim a formát TypeScript enumy — hodnoty sú tie isté reťazce.
    const moznosti = moznostiSkenera(Capacitor.getPlatform(), jednaStrana) as unknown as Parameters<
      typeof DocumentScanner.scanDocument
    >[0];
    const r = await DocumentScanner.scanDocument(moznosti);
    if (r.status === "cancel") return { stav: "zrusene" };
    const obrazky = (r.scannedImages ?? []).filter(Boolean).map(naDataUrl);
    if (!obrazky.length) return { stav: "zrusene" };
    return { stav: "ok", strany: jednaStrana ? obrazky.slice(0, 1) : obrazky };
  } catch (e) {
    /* Android bez Play služieb, emulátor, odmietnutý fotoaparát… */
    return { stav: "nedostupny", dovod: e instanceof Error ? e.message : String(e ?? "") };
  }
}

/**
 * Zachytí doklad: systémový skener, a kde nie je, fotoaparát / výber súboru.
 *
 * Vracia strany ako data URL (JPEG), `null` keď človek skenovanie zrušil.
 * Koľko strán z toho je jeden doklad, rozhoduje volajúci: pri jednom doklade
 * sú to strany jedného dokladu (`stranyDoPdf`), v dávke samostatné doklady.
 *
 * `jednaStrana` — napr. prefotenie fotky pri bločku, kde má zmysel len jedna.
 */
export async function zachytStrany(
  moznosti: { jednaStrana?: boolean } = {},
): Promise<string[] | null> {
  const jednaStrana = moznosti.jednaStrana ?? false;
  const sken = await naskenujSystemom(jednaStrana);
  if (sken.stav === "zrusene") return null;
  if (sken.stav === "ok") return zmestiDoLimitu(sken.strany);
  if (sken.dovod) console.warn("Skener dokumentov nie je k dispozícii:", sken.dovod);
  const cap = await captureReceipt();
  return cap ? [cap.dataUrl] : null;
}
