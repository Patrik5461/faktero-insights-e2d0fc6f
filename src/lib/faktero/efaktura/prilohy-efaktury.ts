/**
 * Prílohy eFaktúry (Peppol BG-24, `AdditionalDocumentReference`).
 *
 * Pravidlá platia rovnako v okne odoslania aj na serveri — človek sa má
 * o zamietnutej prílohe dozvedieť skôr, než klikne „Odoslať", a server to
 * skontroluje znova, lebo okno sa dá obísť.
 *
 * Limity ePoštáka (`POST /documents/send`, schéma `DocumentAttachment`):
 * najviac 20 súborov, 10 MB na súbor a 15 MB spolu (po dekódovaní base64);
 * MIME podľa Peppol BR-CL-22 a ePošták ho overuje podľa prvých bajtov súboru.
 */
import { typSuboru } from "../faktura-prilohy";
import { jazykDokladu } from "../faktura-jazyk";

export const EF_MAX_SUBOROV = 20;
export const EF_MAX_SUBOR = 10 * 1024 * 1024;
export const EF_MAX_SPOLU = 15 * 1024 * 1024;

/** BR-CL-22 — čo sieť Peppol prenesie. Word, ZIP, HEIC či WebP nie. */
export const EF_POVOLENE_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
] as const;

/**
 * Odhad veľkosti PDF faktúry v okne — presnú veľkosť pozná až server, keď ho
 * vyrobí. PDF z Fakteri má zvyčajne do 300 kB; rezerva je zámerne väčšia,
 * aby okno nepustilo niečo, čo server potom odmietne.
 */
export const EF_ODHAD_PDF = 1024 * 1024;

export type PrilohaNaVyber = {
  id: string;
  name: string;
  mime: string | null;
  size: number | null;
};

/** MIME, pod ktorým príloha pôjde do eFaktúry — alebo `null`, keď sa poslať nedá. */
export function mimeEfaktury(mime: string | null | undefined, nazov: string): string | null {
  const m = typSuboru(mime ?? "", nazov);
  if (!m) return null;
  return (EF_POVOLENE_MIME as readonly string[]).includes(m) ? m : null;
}

/** Prečo sa príloha do eFaktúry poslať nedá (bez ohľadu na ostatné), alebo `null`. */
export function dovodNepovolenej(p: PrilohaNaVyber): string | null {
  if (!mimeEfaktury(p.mime, p.name)) {
    return "eFaktúra tento typ neprenesie — povolené sú PDF, PNG, JPG, CSV, XLSX a ODS.";
  }
  const v = Number(p.size ?? 0);
  if (v > EF_MAX_SUBOR) return "Súbor je väčší než 10 MB — eFaktúra ho neprenesie.";
  return null;
}

export type VysledokVyberu = {
  /** Poradie odoslania: PDF faktúry prvé, potom prílohy v poradí nahratia. */
  poradie: { druh: "pdf" | "priloha"; id: string | null; name: string; size: number }[];
  spolu: number;
  chyby: string[];
};

/**
 * Skontroluje výber príloh. `pdfVelkost` je skutočná veľkosť PDF (server)
 * alebo odhad (`EF_ODHAD_PDF` v okne); `null` znamená bez PDF.
 */
export function skontrolujVyber(
  pdfVelkost: number | null,
  vybrane: PrilohaNaVyber[],
  pdfNazov = "faktura.pdf",
): VysledokVyberu {
  const chyby: string[] = [];
  const poradie: VysledokVyberu["poradie"] = [];
  if (pdfVelkost != null) {
    poradie.push({ druh: "pdf", id: null, name: pdfNazov, size: pdfVelkost });
    if (pdfVelkost > EF_MAX_SUBOR) chyby.push("PDF faktúry je väčšie než 10 MB.");
  }
  for (const p of vybrane) {
    const dovod = dovodNepovolenej(p);
    if (dovod) chyby.push(`${p.name}: ${dovod}`);
    poradie.push({ druh: "priloha", id: p.id, name: p.name, size: Number(p.size ?? 0) });
  }
  const spolu = poradie.reduce((s, x) => s + x.size, 0);
  if (poradie.length > EF_MAX_SUBOROV) {
    chyby.push(`eFaktúra unesie najviac ${EF_MAX_SUBOROV} príloh vrátane PDF faktúry.`);
  }
  if (spolu > EF_MAX_SPOLU) {
    chyby.push("Prílohy majú spolu viac než 15 MB — eFaktúra ich neprenesie. Odškrtnite niektoré.");
  }
  return { poradie, spolu, chyby };
}

/**
 * Predvolený výber v okne: povolené prílohy v poradí nahratia, kým sa
 * zmestia do limitov (rovnako ako mail — prílohy idú, pokiaľ sa dá).
 */
export function predvolenyVyber(prilohy: PrilohaNaVyber[], sPdf: boolean): string[] {
  let spolu = sPdf ? EF_ODHAD_PDF : 0;
  let pocet = sPdf ? 1 : 0;
  const vybrane: string[] = [];
  for (const p of prilohy) {
    if (dovodNepovolenej(p)) continue;
    const v = Number(p.size ?? 0);
    if (pocet + 1 > EF_MAX_SUBOROV || spolu + v > EF_MAX_SPOLU) continue;
    spolu += v;
    pocet += 1;
    vybrane.push(p.id);
  }
  return vybrane;
}

const zacina = (b: Uint8Array, ...bajty: number[]) => bajty.every((x, i) => b[i] === x);

/**
 * Sedí obsah s MIME? ePošták ho kontroluje podľa prvých bajtov — nesúlad by
 * vrátil chybu až po odoslaní, tak sa zachytí tu, s menom súboru.
 */
export function obsahSediSMime(b: Uint8Array, mime: string): boolean {
  if (!b.length) return false;
  switch (mime) {
    case "application/pdf":
      return zacina(b, 0x25, 0x50, 0x44, 0x46); // %PDF
    case "image/png":
      return zacina(b, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/jpeg":
      return zacina(b, 0xff, 0xd8, 0xff);
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.oasis.opendocument.spreadsheet":
      return zacina(b, 0x50, 0x4b, 0x03, 0x04); // ZIP
    case "text/csv": {
      // Text — žiadne nulové bajty v začiatku súboru.
      const n = Math.min(b.length, 4096);
      for (let i = 0; i < n; i++) if (b[i] === 0) return false;
      return true;
    }
    default:
      return false;
  }
}

const POPIS_PDF: Record<string, string> = {
  sk: "Faktúra v PDF",
  cs: "Faktura v PDF",
  en: "Invoice in PDF",
  de: "Rechnung als PDF",
  hu: "Számla PDF formátumban",
};

/** Popis PDF prílohy v jazyku dokladu (BT-123). */
export function popisPdfFaktury(jazyk: unknown): string {
  return POPIS_PDF[jazykDokladu(jazyk)] ?? POPIS_PDF.sk!;
}

/**
 * Telo na odtlačok pre `Idempotency-Key`: obsah príloh nahradí jeho hashom.
 * Celé base64 by sa hashovalo zbytočne dvakrát a odtlačok sa má zmeniť
 * práve vtedy, keď sa zmení súbor — to hash obsahu spĺňa.
 */
export function teloNaOdtlacok(
  body: Record<string, unknown>,
  hash: (obsah: string) => string,
): Record<string, unknown> {
  const prilohy = body.attachments;
  if (!Array.isArray(prilohy) || !prilohy.length) return body;
  return {
    ...body,
    attachments: prilohy.map((a: any) => ({
      ...a,
      content: `sha256:${hash(String(a.content ?? ""))}`,
    })),
  };
}
