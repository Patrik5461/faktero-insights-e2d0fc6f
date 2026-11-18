#!/usr/bin/env node
/*
  Zoznam stránok aplikácie pre hlasové ovládanie (`hlas-stranky.ts`).

  Číta `src/routeTree.gen.ts` (FileRoutesById) a zapíše
  `src/lib/faktero/hlas-trasy.gen.ts` — len trasy pod `_authenticated`
  a `/admin`, bez parametrov okrem `$id`. Test `hlas-stranky.test.ts`
  zlyhá, keď súbor nesedí s routeTree — vtedy spusti:

      node scripts/hlas-trasy.mjs
*/
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Trasy z textu routeTree.gen.ts → { aplikacia: [...], admin: [...] } (zoradené, bez duplicít). */
export function trasyZRouteTree(text) {
  const blok = text.match(/export interface FileRoutesById \{([\s\S]*?)\n\}/);
  if (!blok) throw new Error("routeTree.gen.ts: chýba FileRoutesById");
  const kluce = [...blok[1].matchAll(/^\s+'([^']+)':/gm)].map((m) => m[1]);
  const aplikacia = new Set();
  const admin = new Set();
  for (const k of kluce) {
    let cesta;
    let doAdmina = false;
    if (k.startsWith("/_authenticated/")) cesta = k.slice("/_authenticated".length);
    else if (k === "/admin" || k.startsWith("/admin/")) {
      cesta = k;
      doAdmina = true;
    } else continue;
    if (cesta.length > 1) cesta = cesta.replace(/\/+$/, "");
    // Parameter smie byť len $id (detail); $token, $poskytovatel… hlas neotvára.
    const parametre = cesta.match(/\$[\w]+/g) ?? [];
    if (parametre.some((p) => p !== "$id")) continue;
    (doAdmina ? admin : aplikacia).add(cesta);
  }
  return { aplikacia: [...aplikacia].sort(), admin: [...admin].sort() };
}

function zapisSubor() {
  const koren = join(dirname(fileURLToPath(import.meta.url)), "..");
  const text = readFileSync(join(koren, "src/routeTree.gen.ts"), "utf8");
  const { aplikacia, admin } = trasyZRouteTree(text);
  const riadky = (z) => z.map((c) => `  ${JSON.stringify(c)},`).join("\n");
  const obsah = `/* Vygenerované: node scripts/hlas-trasy.mjs (z src/routeTree.gen.ts). Ručne neupravovať. */

export const TRASY_APLIKACIE = [
${riadky(aplikacia)}
] as const;

export const TRASY_ADMINA = [
${riadky(admin)}
] as const;
`;
  writeFileSync(join(koren, "src/lib/faktero/hlas-trasy.gen.ts"), obsah);
  console.log(`hlas-trasy.gen.ts: ${aplikacia.length} trás aplikácie, ${admin.length} admina`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) zapisSubor();
