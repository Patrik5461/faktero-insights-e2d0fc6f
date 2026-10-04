/*
  Zbalí doplnok pre WooCommerce do `public/doplnky/faktero-woocommerce.zip`,
  odkiaľ si ho ľudia stiahnu z Faktera. Spúšťa sa po každej zmene doplnku
  (`npm run doplnok:woo`); test `doplnok-woocommerce.test.ts` stráži, že ZIP
  nezaostal za zdrojom.
*/
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import JSZip from "jszip";

const ZDROJ = "integracie/woocommerce/faktero-woocommerce";
const CIEL = "public/doplnky/faktero-woocommerce.zip";

function subory(dir) {
  return readdirSync(dir).flatMap((n) => {
    const c = join(dir, n);
    return statSync(c).isDirectory() ? subory(c) : [c];
  });
}

const zip = new JSZip();
for (const s of subory(ZDROJ).sort()) {
  // Pevný dátum, aby rovnaký zdroj dal bajt po bajte rovnaký ZIP.
  zip.file(join("faktero-woocommerce", relative(ZDROJ, s)), readFileSync(s), {
    date: new Date("2026-01-01T00:00:00Z"),
  });
}
mkdirSync("public/doplnky", { recursive: true });
writeFileSync(CIEL, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`${CIEL} (${statSync(CIEL).size} B)`);
