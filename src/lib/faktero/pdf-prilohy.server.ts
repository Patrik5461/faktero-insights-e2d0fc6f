/**
 * Súbory vložené v PDF — tam nosí faktúra svoje XML (ISDOC, ZUGFeRD /
 * Factur-X). Číta sa strom `EmbeddedFiles` aj pole `AF` z katalógu, lebo
 * Factur-X zapisuje do oboch a niektoré programy len do jedného.
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFString,
  decodePDFRawStream,
} from "pdf-lib";
import { dokladZXml, type ZdrojXml } from "./doklad-xml";

type Priloha = { nazov: string; data: Uint8Array };

const MAX_PRILOH = 20;

function nazovSuboru(spec: PDFDict): string {
  for (const k of ["UF", "F"]) {
    const v = spec.lookup(PDFName.of(k));
    if (v instanceof PDFString || v instanceof PDFHexString) return v.decodeText();
  }
  return "";
}

function obsahSuboru(spec: PDFDict): Uint8Array | null {
  const ef = spec.lookup(PDFName.of("EF"));
  if (!(ef instanceof PDFDict)) return null;
  const s = ef.lookup(PDFName.of("UF")) ?? ef.lookup(PDFName.of("F"));
  if (!(s instanceof PDFRawStream)) return null;
  try {
    return decodePDFRawStream(s).decode();
  } catch {
    return null;
  }
}

/** Prejde strom mien (`Names` / `Kids`) a zbiera špecifikácie súborov. */
function zoStromu(uzol: PDFDict, out: PDFDict[], hlbka = 0) {
  if (hlbka > 8 || out.length >= MAX_PRILOH) return;
  const mena = uzol.lookup(PDFName.of("Names"));
  if (mena instanceof PDFArray) {
    for (let i = 1; i < mena.size(); i += 2) {
      const spec = mena.lookup(i);
      if (spec instanceof PDFDict) out.push(spec);
    }
  }
  const deti = uzol.lookup(PDFName.of("Kids"));
  if (deti instanceof PDFArray) {
    for (let i = 0; i < deti.size(); i++) {
      const d = deti.lookup(i);
      if (d instanceof PDFDict) zoStromu(d, out, hlbka + 1);
    }
  }
}

export async function prilohyPdf(bajty: Uint8Array): Promise<Priloha[]> {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bajty, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    return [];
  }
  const katalog = pdf.catalog;
  const specy: PDFDict[] = [];
  const mena = katalog.lookup(PDFName.of("Names"));
  if (mena instanceof PDFDict) {
    const ef = mena.lookup(PDFName.of("EmbeddedFiles"));
    if (ef instanceof PDFDict) zoStromu(ef, specy);
  }
  const af = katalog.lookup(PDFName.of("AF"));
  if (af instanceof PDFArray) {
    for (let i = 0; i < af.size(); i++) {
      const s = af.lookup(i);
      if (s instanceof PDFDict && !specy.includes(s)) specy.push(s);
    }
  }
  const out: Priloha[] = [];
  for (const spec of specy.slice(0, MAX_PRILOH)) {
    const data = obsahSuboru(spec);
    if (data?.length) out.push({ nazov: nazovSuboru(spec), data });
  }
  return out;
}

/** Je súbor PDF? Podľa obsahu, mime z mailu býva aj `application/octet-stream`. */
function jePdf(b: Uint8Array): boolean {
  return b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
}

/**
 * Údaje faktúry z vloženého XML (PDF) alebo zo samotného XML súboru, v tvare
 * odpovede AI. `null`, keď strojové údaje doklad nemá — vtedy číta AI.
 */
export async function dokladZPrilohy(
  bajty: Uint8Array,
  mime: string,
): Promise<(Record<string, unknown> & { zdroj_udajov: ZdrojXml }) | null> {
  if (jePdf(bajty)) {
    const prilohy = await prilohyPdf(bajty);
    // Najprv to, čo sa tvári ako faktúra (factur-x.xml, *.isdoc), potom ostatné XML.
    const poradie = [...prilohy].sort((a, b) => skore(b.nazov) - skore(a.nazov));
    for (const p of poradie) {
      if (!/\.(xml|isdoc)$/i.test(p.nazov) && !jeXmlObsah(p.data)) continue;
      const doklad = dokladZXml(new TextDecoder().decode(p.data));
      if (doklad) return doklad;
    }
    return null;
  }
  if (/xml|isdoc/i.test(mime) || jeXmlObsah(bajty)) {
    return dokladZXml(new TextDecoder().decode(bajty));
  }
  return null;
}

function skore(nazov: string): number {
  const n = nazov.toLowerCase();
  if (/factur-x|zugferd|xrechnung/.test(n)) return 3;
  if (n.endsWith(".isdoc")) return 3;
  if (n.endsWith(".xml")) return 1;
  return 0;
}

function jeXmlObsah(b: Uint8Array): boolean {
  const zac = new TextDecoder().decode(b.slice(0, 200)).replace(/^﻿/, "").trimStart();
  return zac.startsWith("<?xml") || zac.startsWith("<");
}
