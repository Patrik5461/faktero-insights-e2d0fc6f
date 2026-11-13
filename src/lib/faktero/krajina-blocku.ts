/**
 * Krajina dodávateľa bločku (ISO kód) pri ukladaní.
 *
 * `expense_documents.supplier_country` bola všade prázdna (13. 11. 2026),
 * takže bloček za palivo v Maďarsku (27 %) či hotel v Rakúsku (20 %) pravidlo
 * DPH odmietlo — kontrolovalo ho sadzbami Slovenska. Krajinu preto
 * doplníme pri každom uložení: z uvedeného kódu/názvu krajiny (OCR, formulár,
 * API), inak z prefixu IČ DPH, inak z názvu štátu v adrese (eKasa/QR).
 *
 * Čistá logika bez I/O.
 */
import { krajinaZIcDph } from "@/lib/faktero/dph-pravidlo";
import { SADZBY_EU } from "@/lib/faktero/sadzby-eu";

/* Názvy štátov (bez diakritiky, veľkými) → ISO. Len tie, čo sa na bločkoch stretnú. */
const NAZVY: [RegExp, string][] = [
  [/\b(SLOVENSK|SLOVAKIA|SLOWAKEI|SZLOVAKIA)/, "SK"],
  [/\b(CESK|CZECH|TSCHECH|CESKO)/, "CZ"],
  [/\b(MAGYARORSZAG|MADARSK|HUNGARY|UNGARN|MADARSKO)/, "HU"],
  [/\b(OSTERREICH|OESTERREICH|RAKUSK|AUSTRIA)\b/, "AT"],
  [/\b(POLSKA|POLSK|POLAND|POLEN)\b/, "PL"],
  [/\b(DEUTSCHLAND|NEMECK|GERMANY)/, "DE"],
  [/\b(HRVATSKA|CHORVATSK|CROATIA|KROATIEN)/, "HR"],
  [/\b(SLOVENIJA|SLOVINSK|SLOVENIA|SLOWENIEN)/, "SI"],
  [/\b(ITALIA|TALIANSK|ITALY|ITALIEN)\b/, "IT"],
  [/\b(ROMANIA|RUMUNSK|RUMANIEN)\b/, "RO"],
];

const bezDiakritiky = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

const KODY = new Set([...SADZBY_EU.map((s) => s.kod), "GB", "CH", "NO", "UA", "RS", "US"]);

/** Kód alebo názov štátu → ISO kód; nič rozpoznateľné → null. */
export function krajinaZTextu(text: string | null | undefined): string | null {
  const t = String(text ?? "").trim();
  if (!t) return null;
  const k = t.toUpperCase();
  if (/^[A-Z]{2}$/.test(k)) return k === "EL" ? "GR" : k;
  if (/^[A-Z]{3}$/.test(k)) {
    const tri: Record<string, string> = { SVK: "SK", CZE: "CZ", HUN: "HU", AUT: "AT", POL: "PL", DEU: "DE", HRV: "HR", SVN: "SI", ITA: "IT", ROU: "RO" };
    if (tri[k]) return tri[k]!;
  }
  const n = bezDiakritiky(t);
  for (const [re, kod] of NAZVY) if (re.test(n)) return kod;
  return null;
}

/** Krajina na konci adresy („…, 1051 Budapest, HU“ / „… Magyarország“). */
function krajinaZAdresy(adresa: string | null | undefined): string | null {
  const a = String(adresa ?? "").trim();
  if (!a) return null;
  const posledna = a.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).pop() ?? "";
  const kod = posledna.toUpperCase();
  if (/^[A-Z]{2}$/.test(kod) && KODY.has(kod === "EL" ? "GR" : kod)) return kod === "EL" ? "GR" : kod;
  // Len posledná časť adresy — „Slovenská 12, Praha“ nie je Slovensko.
  const n = bezDiakritiky(posledna);
  for (const [re, k] of NAZVY) if (re.test(n) && !/\d/.test(n)) return k;
  return null;
}

/**
 * Krajina dodávateľa bločku na uloženie: uvedená krajina (kód alebo názov),
 * inak prefix IČ DPH, inak štát v adrese. Nevie → null (kontrola potom berie
 * dodávateľa ako tuzemského).
 */
export function krajinaBlocku(v: {
  krajina?: string | null;
  icDph?: string | null;
  adresa?: string | null;
}): string | null {
  return krajinaZTextu(v.krajina) ?? krajinaZIcDph(v.icDph) ?? krajinaZAdresy(v.adresa);
}
