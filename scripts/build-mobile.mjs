#!/usr/bin/env node
// Zostavenie mobilnej aplikácie.
//
// Appka má rozhranie v sebe, aby sa otvorila aj bez signálu. Predtým to bol len
// obal nad živým webom a bez pripojenia sa nedalo spraviť nič.
//
// Vyrobí klientský build (`vite.config.mobile.ts` → `dist-mobile`) a prekopíruje
// ho do natívnych projektov cez `cap sync`.
import { spawnSync } from "node:child_process";
import { renameSync, existsSync, readFileSync, writeFileSync } from "node:fs";

function spusti(prikaz, args) {
  const r = spawnSync(prikaz, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

spusti("npx", ["vite", "build", "--config", "vite.config.mobile.ts"]);
// Vite pomenuje výstup podľa vstupného súboru; Capacitor chce index.html.
if (existsSync("dist-mobile/index.mobile.html")) {
  renameSync("dist-mobile/index.mobile.html", "dist-mobile/index.html");
}
console.log("✓ Mobilná appka zostavená v dist-mobile");

// Pečiatka, podľa ktorej staršie appky spoznajú, že je novší balíček.
// `zverejnene` sa zámerne nastaví na false — build vznikne skôr, než ho Apple
// schváli, a posielať ľudí do obchodu pre verziu, ktorá tam nie je, je horšie
// než nepovedať nič. Prepnite ho ručne po zverejnení.
try {
  const cesta = "public/mobil-verzia.json";
  const teraz = new Date().toISOString().slice(0, 16).replace("T", " ");
  const obsah = JSON.parse(readFileSync(cesta, "utf8"));
  writeFileSync(
    cesta,
    JSON.stringify({ ...obsah, peciatka: teraz, zverejnene: false }, null, 2) + "\n",
  );
  console.log(`✓ Pečiatka zapísaná (${teraz}); po zverejnení prepnite zverejnene na true`);
} catch (e) {
  console.warn("! Pečiatku sa nepodarilo zapísať:", e.message);
}

spusti("npx", ["cap", "sync"]);
