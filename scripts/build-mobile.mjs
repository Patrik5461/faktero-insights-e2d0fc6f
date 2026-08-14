#!/usr/bin/env node
// Zostavenie mobilnej aplikácie.
//
// Appka má rozhranie v sebe, aby sa otvorila aj bez signálu. Predtým to bol len
// obal nad živým webom a bez pripojenia sa nedalo spraviť nič.
//
// Vyrobí klientský build (`vite.config.mobile.ts` → `dist-mobile`) a prekopíruje
// ho do natívnych projektov cez `cap sync`.
import { spawnSync } from "node:child_process";
import { renameSync, existsSync } from "node:fs";

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

spusti("npx", ["cap", "sync"]);
