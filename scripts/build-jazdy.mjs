#!/usr/bin/env node
// Zostavenie samostatnej appky Kniha jázd.
//
// To isté, čo `build-mobile.mjs` robí pre Faktero, len s vlastným vstupom a
// výstupom (`vite.config.jazdy.ts` → `dist-jazdy`). `cap sync` sa tu zámerne
// nespúšťa: natívny projekt tejto appky stojí vedľa (`ios-jazdy`) a synchronizuje
// sa vlastným `capacitor.config.jazdy.ts` až na Macu.
import { spawnSync } from "node:child_process";
import { renameSync, existsSync } from "node:fs";

function spusti(prikaz, args) {
  const r = spawnSync(prikaz, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

spusti("npx", ["vite", "build", "--config", "vite.config.jazdy.ts"]);
// Vite pomenuje výstup podľa vstupného súboru; Capacitor chce index.html.
if (existsSync("dist-jazdy/index.jazdy.html")) {
  renameSync("dist-jazdy/index.jazdy.html", "dist-jazdy/index.html");
}
console.log("✓ Kniha jázd zostavená v dist-jazdy");
