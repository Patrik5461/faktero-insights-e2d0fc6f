#!/usr/bin/env node
/**
 * Ktorej appky sa zmena týka?
 *
 * V jednom repozitári bývajú tri veci: web, mobilné Faktero a samostatná
 * Kniha jázd. Väčšina súborov patrí práve jednej z nich, ale tie zaujímavé —
 * `Jazda.tsx`, `Vstup.tsx`, slovníky — patria obom naraz, a práve tam vzniká
 * škoda: oprava pre jednu appku ticho zmení druhú.
 *
 * Rozdelenie sa preto neháda podľa ciest, ale počíta zo skutočných importov.
 * Od vstupného bodu každej appky sa prejde strom `import`ov (aj tých
 * odložených cez `import(...)`) a súbor patrí tej appke, z ktorej je
 * dosiahnuteľný. Keď sa súbor presunie inam, výsledok ostane správny —
 * zoznam ciest by dovtedy dávno klamal.
 *
 * Použitie:
 *   node scripts/ktora-apka.mjs                 # posledný commit
 *   node scripts/ktora-apka.mjs HEAD~5..HEAD    # rozsah
 *   node scripts/ktora-apka.mjs --pracovny      # neuložené zmeny
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const KOREN = resolve(import.meta.dirname, "..");
const VSTUPY = {
  faktero: "src/mobile/main.tsx",
  jazdy: "src/mobile/main-jazdy.tsx",
};
const PRIPONY = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

/** Cesta importu na súbor. Vráti null pre balíky z `node_modules`. */
function nasubor(kam, odkial) {
  let zaklad;
  if (kam.startsWith("@/")) zaklad = join(KOREN, "src", kam.slice(2));
  else if (kam.startsWith(".")) zaklad = resolve(dirname(odkial), kam);
  else return null;

  if (existsSync(zaklad) && statSync(zaklad).isFile()) return zaklad;
  for (const p of PRIPONY) if (existsSync(zaklad + p)) return zaklad + p;
  for (const p of PRIPONY) {
    const i = join(zaklad, "index" + p);
    if (existsSync(i)) return i;
  }
  return null;
}

/* `import x from "…"`, `import "…"`, `export … from "…"` aj `import("…")`. */
const VZOR = /(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']/g;

function dosiahnutelne(vstup) {
  const videne = new Set();
  const fronta = [resolve(KOREN, vstup)];
  while (fronta.length) {
    const s = fronta.pop();
    if (!s || videne.has(s)) continue;
    videne.add(s);
    let text;
    try {
      text = readFileSync(s, "utf8");
    } catch {
      continue;
    }
    for (const [, kam] of text.matchAll(VZOR)) {
      const d = nasubor(kam, s);
      if (d && !videne.has(d)) fronta.push(d);
    }
  }
  return videne;
}

const arg = process.argv[2] ?? "HEAD~1..HEAD";
const gitArgs =
  arg === "--pracovny" ? ["diff", "--name-only", "HEAD"] : ["diff", "--name-only", arg];
const subory = execFileSync("git", gitArgs, { cwd: KOREN, encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

if (!subory.length) {
  console.log("Žiadne zmenené súbory.");
  process.exit(0);
}

const stromy = Object.fromEntries(
  Object.entries(VSTUPY).map(([apka, vstup]) => [apka, dosiahnutelne(vstup)]),
);

/*
  Obal appky nikto neimportuje — konfigurácie, `index.html`, natívny projekt.
  Do stromu importov sa nedostanú, hoci patria jednej appke celé. Preto len pre
  ne existuje aj zoznam ciest; pre kód rozhoduje strom.
*/
const OBALY = [
  [/^(capacitor\.config\.jazdy\.ts|vite\.config\.jazdy\.ts|index\.jazdy\.html|scripts\/build-jazdy\.mjs|ios-jazdy\/|src\/routes\/app-jazdy\.tsx)/, "KNIHA JÁZD"],
  [/^(capacitor\.config\.ts|vite\.config\.mobile\.ts|index\.mobile\.html|scripts\/build-mobile\.mjs|ios\/|src\/routes\/app\.tsx)/, "FAKTERO"],
];

const skupiny = { OBE: [], FAKTERO: [], "KNIHA JÁZD": [], "WEB / OSTATNÉ": [] };
for (const s of subory) {
  const plna = resolve(KOREN, s);
  const vF = stromy.faktero.has(plna);
  const vJ = stromy.jazdy.has(plna);
  if (vF && vJ) skupiny.OBE.push(s);
  else if (vF) skupiny.FAKTERO.push(s);
  else if (vJ) skupiny["KNIHA JÁZD"].push(s);
  else skupiny[OBALY.find(([vzor]) => vzor.test(s))?.[1] ?? "WEB / OSTATNÉ"].push(s);
}

const POPIS = {
  OBE: "mení obe appky — over obe, alebo rozdeľ zmenu",
  FAKTERO: "len mobilné Faktero",
  "KNIHA JÁZD": "len samostatná Kniha jázd",
  "WEB / OSTATNÉ": "do žiadneho z balíčkov sa nedostane",
};

console.log(`\nZmeny v: ${arg === "--pracovny" ? "pracovnom strome" : arg}\n`);
for (const [nazov, zoznam] of Object.entries(skupiny)) {
  if (!zoznam.length) continue;
  console.log(`${nazov}  (${zoznam.length}) — ${POPIS[nazov]}`);
  for (const s of zoznam) console.log(`   ${s}`);
  console.log();
}
if (skupiny.OBE.length) process.exitCode = 0;
