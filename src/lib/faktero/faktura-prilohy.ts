/**
 * Prílohy k vydanému dokladu — pravidlá, ktoré platia rovnako na serveri
 * aj v prehliadači, nech sa človek nedozvie o zamietnutí až po nahratí.
 */

/** 15 MB na súbor; toľko znesie aj úložisko (`invoice-attachments`). */
export const MAX_PRILOHA = 15 * 1024 * 1024;

/** Viac než desať príloh na doklad už nie je príloha, ale archív. */
export const MAX_PRILOH = 10;

/**
 * Čo sa dá priložiť. Okrem PDF a fotiek aj tabuľky a dokumenty — k faktúre
 * za práce chodí výkaz v Exceli rovnako často ako podpísaný dodací list.
 */
export const POVOLENE_TYPY: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.text": "odt",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/xml": "xml",
  "text/xml": "xml",
  "application/zip": "zip",
};

/** Zoznam prípon pre `accept` na poli na výber súboru. */
export const PRIPONY_PRE_VYBER = [
  ...new Set(Object.values(POVOLENE_TYPY).map((p) => `.${p}`)),
].join(",");

/**
 * Prehliadač pri niektorých typoch pošle prázdny alebo vymyslený MIME
 * (`application/octet-stream` pri .heic, nič pri .csv), tak sa dopĺňa
 * z prípony — inak by sa bežný súbor zbytočne odmietol.
 */
export function typSuboru(mime: string, nazov: string): string | null {
  const m = (mime || "").toLowerCase().split(";")[0]!.trim();
  if (POVOLENE_TYPY[m]) return m;
  const pripona = nazov.toLowerCase().split(".").pop() ?? "";
  const podlaPripony = Object.entries(POVOLENE_TYPY).find(([, p]) => p === pripona);
  return podlaPripony ? podlaPripony[0] : null;
}

/** Hláška, prečo sa súbor priložiť nedá — alebo `null`, keď je v poriadku. */
export function chybaPrilohy(
  subor: { name: string; size: number; type: string },
  uzJeIch: number,
): string | null {
  if (uzJeIch >= MAX_PRILOH) return `K dokladu sa dá priložiť najviac ${MAX_PRILOH} súborov.`;
  if (!subor.size) return `${subor.name}: súbor je prázdny.`;
  if (subor.size > MAX_PRILOHA) return `${subor.name}: súbor je väčší než 15 MB.`;
  if (!typSuboru(subor.type, subor.name)) return `${subor.name}: tento typ súboru nepodporujeme.`;
  return null;
}

/** Veľkosť v tvare, ktorý sa dá prečítať. */
export function velkost(bajty: unknown): string {
  const n = Number(bajty);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Názov súboru do cesty v úložisku. Diakritika, medzery a lomky v kľúči
 * robia problémy, tak sa súbor uloží pod náhodným menom — pôvodný názov
 * drží databáza a používa sa pri sťahovaní aj v maile.
 */
export function cestaPrilohy(companyId: string, invoiceId: string, mime: string): string {
  const pripona = POVOLENE_TYPY[mime] ?? "bin";
  return `${companyId}/${invoiceId}/${crypto.randomUUID()}.${pripona}`;
}
