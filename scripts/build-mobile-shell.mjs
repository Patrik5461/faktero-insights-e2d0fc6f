#!/usr/bin/env node
// Faktero mobilný build.
//
// Capacitor v `capacitor.config.ts` má `server.url = https://www.faktero.sk`,
// takže WebView načítava živú webovú appku a lokálny `webDir` slúži len ako
// fallback / povinný artefakt pre `cap sync`. Preto nepúšťame plný Vite SSR
// build (ktorý zlyhá s "rollupOptions.input should not be an html file when
// building for SSR"), ale vygenerujeme minimálny statický shell v
// `.output/public` a spustíme `cap sync`.
//
// Ak sa v budúcnosti prejde na plne bundlený SPA build (bez server.url),
// nahraď obsah tohto skriptu skutočným `vite build --mode mobile` s
// dedikovaným `vite.config.mobile.ts`.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const outDir = resolve(process.cwd(), ".output/public");
mkdirSync(outDir, { recursive: true });

const html = `<!doctype html>
<html lang="sk">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Faktero</title>
    <style>
      html, body { margin: 0; height: 100%; background: #10b981; color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .wrap { display:flex; align-items:center; justify-content:center; height:100%; }
    </style>
    <script>
      // WebView by mal byť už na https://www.faktero.sk cez Capacitor server.url.
      // Ak sa niekedy načíta tento shell priamo (napr. dev inšpekcia), presmeruj.
      if (location.protocol.startsWith("http")) {
        location.replace("https://www.faktero.sk/");
      }
    </script>
  </head>
  <body>
    <div class="wrap">Načítavam Faktero…</div>
  </body>
</html>
`;

writeFileSync(resolve(outDir, "index.html"), html);
console.log("✓ Mobile shell vygenerovaný v .output/public");

const sync = spawnSync("npx", ["cap", "sync"], { stdio: "inherit" });
process.exit(sync.status ?? 0);
