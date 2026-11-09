/**
 * Spoločné voľby `pdfjs.getDocument` pre náhľady PDF.
 *
 * Skeny z kopírok bývajú komprimované JBIG2 (a niektoré JPEG 2000). pdf.js 6
 * ich dekóduje cez WebAssembly, ktoré si stiahne z `wasmUrl` — bez neho sa
 * strany načítali, ale obrázok skenu ostal prázdny (BÝVAJLEPŠIE, JŠ servis,
 * 9. 11. 2026). CMapy a štandardné písma potrebujú PDF s ázijskými či
 * nevloženými písmami. Súbory sú kópiou `node_modules/pdfjs-dist/{wasm,cmaps,
 * standard_fonts}` v `public/pdfjs/`; test `pdfjs-moznosti.test.ts` stráži,
 * že sedia s nainštalovanou verziou.
 */
export const PDFJS_ZDROJE = "/pdfjs/";

export function moznostiPdf(url: string) {
  return {
    url,
    wasmUrl: `${PDFJS_ZDROJE}wasm/`,
    cMapUrl: `${PDFJS_ZDROJE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_ZDROJE}standard_fonts/`,
  };
}
