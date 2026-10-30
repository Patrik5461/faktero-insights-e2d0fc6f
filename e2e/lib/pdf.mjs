/* Text PDF po stranách (pdfjs-dist z node_modules repa). */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cestaModulu } from "./prostredie.mjs";

export async function textPdf(cestaAleboBuf) {
  const koren = path.dirname(cestaModulu("pdfjs-dist/package.json"));
  const { getDocument } = await import(
    pathToFileURL(path.join(koren, "legacy/build/pdf.mjs")).href
  );
  const data = new Uint8Array(
    Buffer.isBuffer(cestaAleboBuf) ? cestaAleboBuf : readFileSync(cestaAleboBuf),
  );
  const doc = await getDocument({ data, verbosity: 0, isEvalSupported: false }).promise;
  const strany = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const obsah = await (await doc.getPage(i)).getTextContent();
    strany.push(obsah.items.map((x) => x.str + (x.hasEOL ? "\n" : " ")).join(""));
  }
  await (doc.destroy?.() ?? doc.cleanup?.());
  return strany;
}
