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

/**
 * Sedí obsah súboru s typom, za ktorý sa vydáva? Príloha odchádza odberateľom
 * e-mailom z našej adresy — program (.exe) premenovaný na „faktura.pdf“ by sme
 * inak rozposielali pod svojím menom. Kontroluje sa začiatok súboru, nie prípona.
 * Vracia hlášku, alebo `null`, keď je obsah v poriadku.
 */
export function chybaObsahuPrilohy(typ: string, bajty: Uint8Array): string | null {
  const b = bajty;
  const zacina = (...z: number[]) => z.every((x, i) => b[i] === x);
  // Spustiteľné súbory (Windows MZ, Linux ELF, macOS Mach-O) nikdy, nech sa volajú akokoľvek.
  if (
    zacina(0x4d, 0x5a) ||
    zacina(0x7f, 0x45, 0x4c, 0x46) ||
    zacina(0xcf, 0xfa, 0xed, 0xfe) ||
    zacina(0xfe, 0xed, 0xfa, 0xcf) ||
    zacina(0xca, 0xfe, 0xba, 0xbe)
  )
    return "Spustiteľný program sa nedá priložiť.";
  const ascii = new TextDecoder("latin1").decode(b.subarray(0, 1024));
  const zip = zacina(0x50, 0x4b, 0x03, 0x04) || zacina(0x50, 0x4b, 0x05, 0x06);
  const ole = zacina(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  const ok: Record<string, () => boolean> = {
    // PDF smie mať pred hlavičkou pár bajtov smetí (tlačiarne, skenery).
    "application/pdf": () => ascii.includes("%PDF-"),
    "image/png": () => zacina(0x89, 0x50, 0x4e, 0x47),
    "image/jpeg": () => zacina(0xff, 0xd8, 0xff),
    "image/webp": () => ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP",
    "image/heic": () => ascii.slice(4, 8) === "ftyp",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": () => zip,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": () => zip,
    "application/vnd.oasis.opendocument.spreadsheet": () => zip,
    "application/vnd.oasis.opendocument.text": () => zip,
    "application/zip": () => zip,
    "application/vnd.ms-excel": () => ole || zip,
    "application/msword": () => ole,
  };
  const kontrola = ok[typ];
  if (kontrola) return kontrola() ? null : "Obsah súboru nezodpovedá jeho typu (prípone).";
  // Text, CSV a XML: žiadne nulové bajty (binárny súbor s príponou .txt).
  // UTF-16 (Excel „Unicode text“) nuly má — spozná sa podľa BOM.
  const utf16 = zacina(0xff, 0xfe) || zacina(0xfe, 0xff);
  if (!utf16 && b.subarray(0, 8192).includes(0))
    return "Obsah súboru nezodpovedá jeho typu (prípone).";
  return null;
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
