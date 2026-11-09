import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/* Kópia doplnkov pdf.js v public/pdfjs musí sedieť s nainštalovanou verziou. */
describe("doplnky pdf.js v public/pdfjs", () => {
  const koren = path.resolve(__dirname, "../../..");
  for (const priecinok of ["wasm", "cmaps", "standard_fonts"]) {
    it(`${priecinok} sedí s node_modules/pdfjs-dist`, () => {
      const zdroj = path.join(koren, "node_modules/pdfjs-dist", priecinok);
      const kopia = path.join(koren, "public/pdfjs", priecinok);
      const subory = readdirSync(zdroj).filter((s) => !s.startsWith("LICENSE"));
      for (const s of subory) {
        expect(readFileSync(path.join(kopia, s)).equals(readFileSync(path.join(zdroj, s))), s).toBe(true);
      }
    });
  }
});
