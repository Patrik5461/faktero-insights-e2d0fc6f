/*
  Zachytenie strán dokladu.

  Doklad sa fotí kamerou v stránke (`kamera-dokladu.ts`): živý obraz s
  obrysom dokladu, po odfotení „Upraviť doklad" s rohmi, filtrami a
  otočením — rovnako ako v Doklado, jedna kamera na všetko.

  Predtým tu bol systémový skener dokumentov (`@capgo/capacitor-document-scanner`
  — VisionKit na iOS, ML Kit na Androide). Bol to však druhý skener: človek
  mieril v appke, stlačil spúšť a otvoril sa mu ďalší so samozameraním.
  Plugin je z appky odstránený (1.6.4, build po 269).

  Kde kamera v stránke nie je (odmietnuté povolenie, prehliadač bez kamery),
  ide sa po starom cez `captureReceipt` — fotoaparát alebo výber súboru.
  Zrušenie je iná vec než nedostupná kamera: človek si to rozmyslel, takže
  sa nič neotvára znova a nič sa nehlási.
*/

import { captureReceipt } from "./receipt-scanner";
import { velkostDataUrl, MAX_VELKOST_B } from "./davka-dokladov";
import { otvorKameruDokladu } from "./kamera-dokladu";

/** Kvalita JPEG pri zmenšovaní. Text ostane ostrý a strana má bežne pod 1,5 MB. */
export const KVALITA_SKENU = 80;
/** Koľko strán unesie jeden doklad. */
export const MAX_STRAN = 20;
/**
 * Rozpočet na jeden doklad pred nahratím. Server berie 15 MB na súbor
 * (`MAX_VELKOST_B`); PDF zo strán pridá pár kilobajtov a nechávame si rezervu.
 */
export const ROZPOCET_DOKLADU_B = MAX_VELKOST_B - 1024 * 1024;

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

/**
 * Zachytí doklad: kamera v stránke, a kde nie je, fotoaparát / výber súboru.
 *
 * Vracia strany ako data URL (JPEG), `null` keď človek fotenie zrušil.
 * Koľko strán z toho je jeden doklad, rozhoduje volajúci: pri jednom doklade
 * sú to strany jedného dokladu (`stranyDoPdf`), v dávke samostatné doklady.
 *
 * `jednaStrana` — napr. prefotenie fotky pri bločku, kde má zmysel len jedna.
 * `davka` — každá strana je samostatný doklad (mení len texty tlačidiel).
 */
export async function zachytStrany(
  moznosti: { jednaStrana?: boolean; davka?: boolean } = {},
): Promise<string[] | null> {
  const kamera = await otvorKameruDokladu(moznosti);
  if (kamera?.stav === "zrusene") return null;
  if (kamera?.stav === "ok") {
    const strany = moznosti.jednaStrana ? kamera.strany.slice(0, 1) : kamera.strany;
    return strany.length ? zmestiDoLimitu(strany) : null;
  }
  const cap = await captureReceipt();
  return cap ? [cap.dataUrl] : null;
}
