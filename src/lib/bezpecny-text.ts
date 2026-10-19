/*
  Text z dokladov (meno odberateľa, číslo faktúry, miesto jazdy…) zapisuje
  človek, odosielateľ eFaktúry alebo e-mailu. Kým sa vloží do HTML alebo CSV,
  musí prejsť týmito funkciami.
*/

/** Znaky, ktoré by v HTML otvorili značku alebo atribút. */
export function escHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Excel a LibreOffice berú bunku začínajúcu `= + - @` (aj s tabulátorom či
 * novým riadkom na začiatku) ako vzorec — `=HYPERLINK(…)` z mena dodávateľa by
 * sa po otvorení exportu spustil. Apostrof pred textom ho vypne. Čísla
 * (aj záporné) ostávajú, ako sú.
 */
export function bezVzorca(v: unknown): string {
  const s = String(v ?? "");
  if (typeof v === "number") return s;
  if (/^[-+]?\d+([.,]\d+)?$/.test(s.trim())) return s;
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/**
 * Meno odosielateľa do hlavičky From. Úvodzovky, lomené zátvorky a nové
 * riadky by z mena firmy spravili inú adresu alebo ďalšiu hlavičku.
 */
export function menoOdosielatela(v: unknown, predvolene = "Faktero"): string {
  const s = String(v ?? "")
    .replace(/[\r\n<>"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return s || predvolene;
}

/**
 * Text od neprihláseného človeka (verejná „Faktúra zadarmo“) pred tlačou do
 * PDF. Vyhodí riadiace znaky, znaky mimo základnej roviny Unicode (emoji —
 * písmo dokladu ich nemá a pdf-lib by ich nakreslil ako štvorčeky) a znaky,
 * ktoré otáčajú smer textu alebo sú neviditeľné (U+202E a spol. — nimi sa na
 * doklade dá schovať iný IBAN či názov). Medzery zlúči a dĺžku oreže.
 *
 * `riadky: true` ponechá zalomenia riadkov (poznámka), najviac `maxRiadkov`.
 */
export function cistyText(
  v: unknown,
  max: number,
  o: { riadky?: boolean; maxRiadkov?: number } = {},
): string {
  const s = String(v ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/[​-‏‪-‮⁠-⁩﻿￰-￿]/g, "")
    .replace(/[\uD800-\uDFFF]/g, "");
  const riadok = (r: string) =>
    r
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  if (!o.riadky) return riadok(s).slice(0, max).trim();
  return s
    .split("\n")
    .map(riadok)
    .slice(0, o.maxRiadkov ?? 30)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, max)
    .trim();
}
