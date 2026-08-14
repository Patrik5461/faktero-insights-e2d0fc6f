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
      :root { color-scheme: light dark; }
      html, body { margin: 0; height: 100%; background: #10b981; color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        -webkit-font-smoothing: antialiased; }
      .wrap { display:flex; flex-direction:column; align-items:center; justify-content:center;
        height:100%; padding: 24px; text-align:center; box-sizing:border-box; gap: 10px; }
      h1 { font-size: 19px; margin: 0; font-weight: 600; }
      p { margin: 0; font-size: 15px; line-height: 1.5; opacity: .9; max-width: 300px; }
      button { margin-top: 14px; padding: 12px 22px; font-size: 16px; font-weight: 600;
        border: 0; border-radius: 12px; background: #fff; color: #047857; }
      button:disabled { opacity: .6; }
      .skryte { display: none; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <!-- Bez pripojenia tu appka zostane, lebo rozhranie sa načítava zo živého
           webu. Predtým tu svietilo „Načítavam Faktero…“ donekonečna a vyzeralo
           to ako zamrznutá appka. -->
      <div id="nacitavam">
        <h1>Načítavam Faktero…</h1>
      </div>
      <div id="offline" class="skryte">
        <h1>Nie ste pripojený</h1>
        <p>
          Faktero potrebuje internet. Zaznamenané jazdy a odfotené doklady sa
          medzitým nestratia — odošlú sa samé, len čo sa pripojíte.
        </p>
        <button id="znova" type="button">Skúsiť znova</button>
      </div>
    </div>
    <script>
      var CIEL = "https://www.faktero.sk/app";
      var nacitavam = document.getElementById("nacitavam");
      var offline = document.getElementById("offline");
      var tlacidlo = document.getElementById("znova");

      function skus() {
        if (navigator.onLine === false) return ukazOffline();
        nacitavam.classList.remove("skryte");
        offline.classList.add("skryte");
        location.replace(CIEL);
      }
      function ukazOffline() {
        nacitavam.classList.add("skryte");
        offline.classList.remove("skryte");
        schovajSplash();
      }

      // Splash schováva webová vrstva až po načítaní stránky. Bez signálu sa
      // nenačíta nikdy a v appke by ostalo svietiť len logo — preto ho schová
      // aj táto obrazovka, cez most, ktorý Capacitor vkladá do lokálnych stránok.
      function schovajSplash() {
        try {
          var p = window.Capacitor && window.Capacitor.Plugins;
          if (p && p.SplashScreen) p.SplashScreen.hide();
        } catch (e) {
          /* na webe žiadny most nie je, netreba nič */
        }
      }

      // Poistka: keby zlyhalo aj presmerovanie, logo nesmie visieť donekonečna.
      setTimeout(schovajSplash, 4000);

      tlacidlo.addEventListener("click", skus);
      // Len čo sa signál vráti, netreba čakať na klik.
      window.addEventListener("online", skus);
      skus();
    </script>
  </body>
</html>
`;

writeFileSync(resolve(outDir, "index.html"), html);
console.log("✓ Mobile shell vygenerovaný v .output/public");

const sync = spawnSync("npx", ["cap", "sync"], { stdio: "inherit" });
process.exit(sync.status ?? 0);
