#!/usr/bin/env node
// Zostavenie samostatnej appky Kniha jázd.
//
// To isté, čo `build-mobile.mjs` robí pre Faktero, len s vlastným vstupom a
// výstupom (`vite.config.jazdy.ts` → `dist-jazdy`).
//
// Android sa synchronizuje rovno tu — postaví sa celý na serveri. iOS nie:
// `ios-jazdy` sa dá zosynchronizovať len na Macu, takže `cap sync ios` musí
// spustiť človek tam. Obe strany si appku vyberajú premennou `CAPACITOR_APP`,
// lebo Capacitor číta vždy len `capacitor.config.ts`.
import { spawnSync } from "node:child_process";
import { renameSync, existsSync } from "node:fs";

function spusti(prikaz, args) {
  const r = spawnSync(prikaz, args, {
    stdio: "inherit",
    env: { ...process.env, CAPACITOR_APP: "jazdy" },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

spusti("npx", ["vite", "build", "--config", "vite.config.jazdy.ts"]);
// Vite pomenuje výstup podľa vstupného súboru; Capacitor chce index.html.
if (existsSync("dist-jazdy/index.jazdy.html")) {
  renameSync("dist-jazdy/index.jazdy.html", "dist-jazdy/index.html");
}
console.log("✓ Kniha jázd zostavená v dist-jazdy");

if (existsSync("android-jazdy")) {
  spusti("npx", ["cap", "sync", "android"]);
}
