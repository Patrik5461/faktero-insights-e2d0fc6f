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
      #nadstavba { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
      #nadstavba.skryte { display: none; }
      .vedlajsie { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.5);
        font-weight: 500; }
      .hlaska { margin-top: 12px; font-size: 14px; min-height: 20px; }
      select { padding: 11px 12px; font-size: 16px; border: 0; border-radius: 12px;
        background: rgba(255,255,255,.15); color: #fff; }
      select.skryte { display: none; }
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
          Rozhranie Faktera sa bez internetu nenačíta. Jazdu a doklad ale
          zvládnete aj teraz — uložia sa do telefónu a odošlú sa samy po
          pripojení.
        </p>
        <div id="nadstavba" class="skryte">
          <select id="vozidlo" class="skryte" aria-label="Vozidlo"></select>
          <button id="jazda" type="button">Spustiť jazdu</button>
          <button id="qr" type="button">Načítať QR z bločku</button>
          <button id="doklad" type="button">Odfotiť doklad</button>
        </div>
        <p id="hlaska" class="hlaska"></p>
        <button id="znova" type="button" class="vedlajsie">Skúsiť znova</button>
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
        pripravNadstavbu();
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

      // ── Čo sa dá spraviť bez pripojenia ────────────────────────────────
      // Rozhranie sa načítava zo živého webu, ale natívne pluginy sú tu aj
      // offline. Jazdu preto vie spustiť plugin priamo a doklad sa odfotí a
      // odloží do súborov telefónu; appka si ho prevezme pri najbližšom
      // pripojení. Odkladá sa cez Preferences, lebo tá je natívna a vidí do nej
      // aj web — jeho localStorage aj IndexedDB sú na inom pôvode.
      var KLUC_DOKLADOV = "faktero.offline.doklady";
      var KLUC_PODKLADOV = "faktero.offline.podklady";
      var KLUC_JAZD = "faktero.offline.jazdy";
      var jazdaBezi = false;
      var aktivnaJazdaId = null;

      function pluginy() {
        return (window.Capacitor && window.Capacitor.Plugins) || null;
      }
      function hlaska(text) {
        document.getElementById("hlaska").textContent = text || "";
      }

      function pripravNadstavbu() {
        var p = pluginy();
        if (!p || !p.DriveDetector) return;
        document.getElementById("nadstavba").classList.remove("skryte");
        p.DriveDetector.getState()
          .then(function (stav) {
            jazdaBezi = !!(stav && stav.activeTrip);
            aktivnaJazdaId = jazdaBezi ? stav.activeTrip.id : null;
            document.getElementById("jazda").textContent = jazdaBezi
              ? "Ukončiť jazdu"
              : "Spustiť jazdu";
          })
          .catch(function () {});
        naplnVozidla();
      }

      // Autá si appka odložila, kým bola online — inak by sa tu nedali ponúknuť.
      function naplnVozidla() {
        var p = pluginy();
        if (!p || !p.Preferences) return;
        p.Preferences.get({ key: KLUC_PODKLADOV })
          .then(function (ulozene) {
            var podklady = null;
            try {
              podklady = JSON.parse((ulozene && ulozene.value) || "null");
            } catch (e) {}
            if (!podklady || !podklady.vozidla || podklady.vozidla.length === 0) return;
            var sel = document.getElementById("vozidlo");
            sel.innerHTML = "";
            podklady.vozidla.forEach(function (v) {
              var o = document.createElement("option");
              o.value = v.id;
              o.textContent = v.name + (v.license_plate ? " — " + v.license_plate : "");
              if (v.id === podklady.mojeVozidloId) o.selected = true;
              sel.appendChild(o);
            });
            // Pri jedinom aute nie je čo vyberať.
            if (podklady.vozidla.length > 1) sel.classList.remove("skryte");
          })
          .catch(function () {});
      }

      function zvoleneVozidlo() {
        var sel = document.getElementById("vozidlo");
        return sel && sel.value ? sel.value : null;
      }

      // Auto k jazde sa odloží zvlášť — plugin o vozidlách nič nevie.
      function zapamatajAutoKJazde(tripId, vehicleId) {
        var p = pluginy();
        if (!p || !p.Preferences || !tripId || !vehicleId) return Promise.resolve();
        return p.Preferences.get({ key: KLUC_JAZD }).then(function (ulozene) {
          var mapa = {};
          try {
            mapa = JSON.parse((ulozene && ulozene.value) || "{}");
          } catch (e) {
            mapa = {};
          }
          mapa[tripId] = vehicleId;
          return p.Preferences.set({ key: KLUC_JAZD, value: JSON.stringify(mapa) });
        });
      }

      function prepniJazdu() {
        var p = pluginy();
        if (!p || !p.DriveDetector) return;
        var tlac = document.getElementById("jazda");
        tlac.disabled = true;
        var akcia = jazdaBezi ? p.DriveDetector.endTrip() : p.DriveDetector.startTrip();
        akcia
          .then(function (r) {
            // Pri štarte vráti plugin jazdu, pri ukončení ju má vo vlastnosti trip.
            var jazda = r && r.trip ? r.trip : r;
            var id = jazda && jazda.id ? jazda.id : aktivnaJazdaId;
            aktivnaJazdaId = jazdaBezi ? null : id;
            var auto = zvoleneVozidlo();
            if (id && auto) zapamatajAutoKJazde(id, auto);
            jazdaBezi = !jazdaBezi;
            tlac.textContent = jazdaBezi ? "Ukončiť jazdu" : "Spustiť jazdu";
            if (!jazdaBezi) {
              var km = r && r.trip ? Math.round((r.trip.distanceMeters / 1000) * 10) / 10 : 0;
              hlaska("Jazda uložená (" + km + " km). Zaradíte ju po pripojení.");
            } else {
              hlaska("Jazda beží. Telefón môžete zamknúť.");
            }
          })
          .catch(function (e) {
            hlaska("Jazdu sa nepodarilo prepnúť: " + (e && e.message ? e.message : e));
          })
          .then(function () {
            tlac.disabled = false;
          });
      }

      function odfotDoklad() {
        var p = pluginy();
        if (!p || !p.Camera || !p.Filesystem || !p.Preferences) {
          return hlaska("Fotoaparát tu nie je dostupný.");
        }
        var tlac = document.getElementById("doklad");
        tlac.disabled = true;
        p.Camera.getPhoto({ quality: 60, resultType: "base64", source: "CAMERA", correctOrientation: true })
          .then(function (foto) {
            var id = String(Date.now()) + "-" + Math.floor(Math.random() * 100000);
            var nazov = "offline-doklady/" + id + "." + (foto.format || "jpeg");
            return p.Filesystem.writeFile({
              path: nazov,
              data: foto.base64String,
              directory: "DATA",
              recursive: true,
            }).then(function () {
              return p.Preferences.get({ key: KLUC_DOKLADOV }).then(function (ulozene) {
                var zoznam = [];
                try {
                  zoznam = JSON.parse((ulozene && ulozene.value) || "[]");
                } catch (e) {
                  zoznam = [];
                }
                zoznam.push({ id: id, path: nazov, mime: "image/" + (foto.format || "jpeg"), ts: Date.now() });
                return p.Preferences.set({ key: KLUC_DOKLADOV, value: JSON.stringify(zoznam) }).then(
                  function () {
                    hlaska("Doklad uložený (" + zoznam.length + " čaká). Odošle sa po pripojení.");
                  },
                );
              });
            });
          })
          .catch(function (e) {
            // Zrušené fotenie nie je chyba, netreba strašiť.
            var m = e && e.message ? e.message : String(e);
            if (!/cancel/i.test(m)) hlaska("Doklad sa nepodarilo uložiť: " + m);
          })
          .then(function () {
            tlac.disabled = false;
          });
      }

      function nacitajQr() {
        var p = pluginy();
        if (!p || !p.BarcodeScanner) return hlaska("Skener tu nie je dostupný.");
        var tlac = document.getElementById("qr");
        tlac.disabled = true;
        p.BarcodeScanner.requestPermissions()
          .then(function (perm) {
            if (perm.camera !== "granted" && perm.camera !== "limited") {
              throw new Error("bez povolenia fotoaparátu");
            }
            return p.BarcodeScanner.scan();
          })
          .then(function (v) {
            var raw = v && v.barcodes && v.barcodes[0] ? v.barcodes[0].rawValue : null;
            if (!raw) return hlaska("QR kód sa nenačítal.");
            return ulozDoklad({ qr_raw: raw });
          })
          .catch(function (e) {
            var m = e && e.message ? e.message : String(e);
            if (!/cancel/i.test(m)) hlaska("QR sa nepodarilo načítať: " + m);
          })
          .then(function () {
            tlac.disabled = false;
          });
      }

      // Doklad — fotka, QR alebo oboje. Ukladá sa rovnako, appka si to prevezme.
      function ulozDoklad(zaznam) {
        var p = pluginy();
        return p.Preferences.get({ key: KLUC_DOKLADOV }).then(function (ulozene) {
          var zoznam = [];
          try {
            zoznam = JSON.parse((ulozene && ulozene.value) || "[]");
          } catch (e) {
            zoznam = [];
          }
          zaznam.id = String(Date.now()) + "-" + Math.floor(Math.random() * 100000);
          zaznam.ts = Date.now();
          zoznam.push(zaznam);
          return p.Preferences.set({ key: KLUC_DOKLADOV, value: JSON.stringify(zoznam) }).then(
            function () {
              hlaska("Doklad uložený (" + zoznam.length + " čaká). Odošle sa po pripojení.");
            },
          );
        });
      }

      document.getElementById("qr").addEventListener("click", nacitajQr);
      document.getElementById("jazda").addEventListener("click", prepniJazdu);
      document.getElementById("doklad").addEventListener("click", odfotDoklad);

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
