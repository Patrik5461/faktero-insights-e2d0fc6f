/**
 * Prílohy k vydanému dokladu — pravidlá, ktoré platia rovnako na serveri
 * aj v prehliadači, nech sa človek nedozvie o zamietnutí až po nahratí.
 */

/**
 * Doklady, ku ktorým sa dá priložiť súbor. Každý má v tabuľke príloh vlastný
 * stĺpec s cudzím kľúčom — tak sa príloha pri zmazaní dokladu zmaže s ním.
 */
export const DRUHY_S_PRILOHAMI = {
  invoice: {
    stlpec: "invoice_id",
    tabulka: "invoices",
    nazov: "Faktúra",
    prilohy: "invoice_attachments",
  },
  quote: {
    stlpec: "quote_id",
    tabulka: "quotes",
    nazov: "Cenová ponuka",
    prilohy: "invoice_attachments",
  },
  sales_order: {
    stlpec: "sales_order_id",
    tabulka: "sales_orders",
    nazov: "Objednávka",
    prilohy: "invoice_attachments",
  },
  /* Prijaté doklady majú prílohy zvlášť — patria pod oblasť práv „doklady“. */
  purchase_invoice: {
    stlpec: "purchase_invoice_id",
    tabulka: "purchase_invoices",
    nazov: "Prijatá faktúra",
    prilohy: "prilohy_dokladov",
  },
  expense: {
    stlpec: "expense_document_id",
    tabulka: "expense_documents",
    nazov: "Doklad",
    prilohy: "prilohy_dokladov",
  },
} as const;

export type DruhSPrilohou = keyof typeof DRUHY_S_PRILOHAMI;

/**
 * 15 MB na súbor (desiatkovo, 15 000 000 B). Súbor ide na server v base64 —
 * narastie o tretinu — a nginx pustí telo požiadavky najviac 20 MiB
 * (`client_max_body_size 20M`). Pri 15 MiB by base64 vyšlo presne na 20 MiB
 * a s obalom požiadavky by ho nginx odmietol (413). Úložisko berie 15 MiB.
 */
export const MAX_PRILOHA = 15_000_000;

/** Strop tela požiadavky v nginx (`client_max_body_size 20M`). */
export const STROP_POZIADAVKY = 20 * 1024 * 1024;

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
  // Desatinná čiarka ako všade v slovenskom, českom aj nemeckom rozhraní.
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Názov súboru do cesty v úložisku. Diakritika, medzery a lomky v kľúči
 * robia problémy, tak sa súbor uloží pod náhodným menom — pôvodný názov
 * drží databáza a používa sa pri sťahovaní aj v maile.
 */
export function cestaPrilohy(companyId: string, dokladId: string, mime: string): string {
  const pripona = POVOLENE_TYPY[mime] ?? "bin";
  return `${companyId}/${dokladId}/${crypto.randomUUID()}.${pripona}`;
}

/** Najviac toľko bajtov spolu ide do jedného ZIP-u „Stiahnuť všetky prílohy“. */
export const MAX_ZIP_PRILOH = 60 * 1024 * 1024;

/**
 * Názvy súborov do ZIP-u: bez lomiek a riadiacich znakov (súbor by sa
 * rozbalil mimo priečinka) a bez dvojíc — dva „sken.pdf“ by sa v archíve
 * prepísali, druhý dostane „sken (2).pdf“.
 */
export function nazvyDoZipu(nazvy: string[]): string[] {
  const pouzite = new Set<string>();
  return nazvy.map((povodny) => {
    const cisty =
      String(povodny ?? "")
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, "_")
        .replace(/^\.+/, "")
        .trim()
        .slice(0, 150) || "priloha";
    const bodka = cisty.lastIndexOf(".");
    const meno = bodka > 0 ? cisty.slice(0, bodka) : cisty;
    const pripona = bodka > 0 ? cisty.slice(bodka) : "";
    let kandidat = cisty;
    for (let i = 2; pouzite.has(kandidat.toLowerCase()); i++) kandidat = `${meno} (${i})${pripona}`;
    pouzite.add(kandidat.toLowerCase());
    return kandidat;
  });
}
