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
