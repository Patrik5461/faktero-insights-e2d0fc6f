/**
 * Vyrobí ikonu a úvodnú obrazovku pre iOS.
 *
 * Projekt mal doteraz predvolené obrázky Capacitora (modrý štvorec), takže by
 * appka mala na ploche cudziu ikonu a pri štarte biele okno s cudzím logom.
 *
 * Dve veci, na ktorých to inak stroskotá:
 * 1. **Ikona nesmie mať alfa kanál** — validátor App Store taký súbor odmietne.
 *    Zapisuje sa preto ako `colorType: 2` (RGB bez priehľadnosti).
 * 2. **Zaoblené rohy si kreslí iOS sám.** Priehľadné rohy predlohy sa preto
 *    nedopĺňajú jednou farbou, ale predĺžením farby najbližšieho nepriehľadného
 *    bodu v riadku — prechod v pozadí ikony tak ostane plynulý.
 *
 * Spustenie: node scripts/ios-ikony.mjs
 *            CAPACITOR_APP=jazdy node scripts/ios-ikony.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const KOREN = new URL("..", import.meta.url).pathname;

/**
 * Obe appky stoja vedľa seba v tom istom repozitári a líšia sa len predlohou,
 * farbou a priečinkom natívneho projektu. Kniha jázd má vlastnú ikonu zámerne:
 * dve appky tej istej firmy s rovnakým znakom sú presne to, na čo Apple pozerá
 * pri pravidle 4.3 — a človek by ich na ploche od seba nerozoznal.
 */
const APKY = {
  faktero: {
    predloha: "public/faktero-icon.png",
    projekt: "ios/App/App/Assets.xcassets",
    podklad: [0x00, 0x7e, 0x46],
  },
  jazdy: {
    predloha: "public/kniha-jazd-icon.png",
    projekt: "ios-jazdy/App/App/Assets.xcassets",
    podklad: [0x1f, 0x2a, 0x33],
  },
};

const APKA = process.env.CAPACITOR_APP === "jazdy" ? APKY.jazdy : APKY.faktero;
const PREDLOHA = `${KOREN}${APKA.predloha}`;
const IKONA = `${KOREN}${APKA.projekt}/AppIcon.appiconset/AppIcon-512@2x.png`;
const SPLASH_DIR = `${KOREN}${APKA.projekt}/Splash.imageset`;

/** Farba úvodnej obrazovky — musí sedieť so `SplashScreen.backgroundColor` v capacitor.config. */
const ZELENA = APKA.podklad;

const zdroj = PNG.sync.read(readFileSync(PREDLOHA));

/** Bod z predlohy ako [r,g,b,a]. */
function bod(x, y) {
  const i = (zdroj.width * y + x) << 2;
  return [zdroj.data[i], zdroj.data[i + 1], zdroj.data[i + 2], zdroj.data[i + 3]];
}

/* ---------- ikona ---------- */

const ikona = new PNG({ width: zdroj.width, height: zdroj.height, colorType: 2, inputHasAlpha: false });
for (let y = 0; y < zdroj.height; y++) {
  // Najbližší nepriehľadný bod zľava a sprava v tomto riadku.
  let prvy = 0;
  while (prvy < zdroj.width && bod(prvy, y)[3] < 250) prvy++;
  let posledny = zdroj.width - 1;
  while (posledny >= 0 && bod(posledny, y)[3] < 250) posledny--;

  for (let x = 0; x < zdroj.width; x++) {
    let [r, g, b, a] = bod(x, y);
    if (a < 250) {
      // Riadok úplne priehľadný (nemalo by nastať) — vezmi farbu zo stredu obrázka.
      const nx = prvy > posledny ? zdroj.width >> 1 : x < prvy ? prvy : posledny;
      const ny = prvy > posledny ? zdroj.height >> 1 : y;
      [r, g, b] = bod(nx, ny);
    }
    const j = (ikona.width * y + x) * 3;
    ikona.data[j] = r;
    ikona.data[j + 1] = g;
    ikona.data[j + 2] = b;
  }
}
writeFileSync(IKONA, PNG.sync.write(ikona, { colorType: 2, inputHasAlpha: false }));

/* ---------- úvodná obrazovka ---------- */

const S = 2732;
const ZNAK = 820; // ikona v strede, zvyšok je čistá zelená
const posun = (S - ZNAK) >> 1;

const splash = new PNG({ width: S, height: S, colorType: 2, inputHasAlpha: false });
for (let i = 0; i < S * S; i++) {
  splash.data[i * 3] = ZELENA[0];
  splash.data[i * 3 + 1] = ZELENA[1];
  splash.data[i * 3 + 2] = ZELENA[2];
}

for (let y = 0; y < ZNAK; y++) {
  const sy = Math.min(zdroj.height - 1, Math.floor((y * zdroj.height) / ZNAK));
  for (let x = 0; x < ZNAK; x++) {
    const sx = Math.min(zdroj.width - 1, Math.floor((x * zdroj.width) / ZNAK));
    const [r, g, b, a] = bod(sx, sy);
    if (!a) continue;
    const j = (S * (y + posun) + (x + posun)) * 3;
    const k = a / 255;
    splash.data[j] = Math.round(r * k + ZELENA[0] * (1 - k));
    splash.data[j + 1] = Math.round(g * k + ZELENA[1] * (1 - k));
    splash.data[j + 2] = Math.round(b * k + ZELENA[2] * (1 - k));
  }
}

const data = PNG.sync.write(splash, { colorType: 2, inputHasAlpha: false });
for (const meno of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  writeFileSync(`${SPLASH_DIR}/${meno}`, data);
}

console.log(`ikona ${zdroj.width}×${zdroj.height} bez alfa kanála a úvodná obrazovka ${S}×${S} hotové`);
