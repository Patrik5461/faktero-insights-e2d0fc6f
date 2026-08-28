/**
 * Vyrobí ikony a úvodnú obrazovku pre Android z `public/faktero-icon.png`.
 *
 * Obdoba `ios-ikony.mjs`, ale Android chce viac vecí naraz:
 *
 * 1. **Prispôsobivá ikona** (Android 8+) — popredie na priehľadnom pozadí,
 *    pozadie je farba. Systém si z toho vyreže kruh, štvorec so zaoblením
 *    alebo čokoľvek, čo má výrobca rád, takže znak musí byť v bezpečnej zóne:
 *    z 108 dp je vidno len stredných 72 dp.
 * 2. **Staré ikony** (Android 7 a staršie) — hotový štvorec a hotový kruh.
 * 3. **Úvodná obrazovka** — zelená plocha so znakom v strede, zvlášť pre
 *    výšku a pre šírku, v piatich hustotách.
 *
 * Prečo nie hotový nástroj: `@capacitor/assets` ťahá ostrý reťazec závislostí
 * a my potrebujeme presne tri veci, ktoré sa dajú spočítať na mieste.
 *
 * Spustenie: node scripts/android-ikony.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const KOREN = new URL("..", import.meta.url).pathname;
const PREDLOHA = `${KOREN}public/faktero-icon.png`;
const RES = `${KOREN}android/app/src/main/res`;

/** Zelená úvodnej obrazovky — musí sedieť so `SplashScreen.backgroundColor` v capacitor.config.ts. */
const ZELENA = [0x00, 0x7e, 0x46];

/**
 * Predloha je hotová ikona: zelený zaoblený štvorec s bielym „F". Do
 * prispôsobivej ikony sa taká vložiť nedá — systém si z nej vyreže vlastný
 * tvar a vznikol by štvorec v kruhu. Potrebujeme preto samotný znak.
 *
 * Pozadie je tmavozelené (súčet zložiek okolo 180), znak biely (765) a jeho
 * svetlejšia časť okolo 560. Prah v strede oboje spoľahlivo oddelí.
 */
const PRAH_ZNAKU = 300;

/** Hustoty a ich násobok. `mdpi` je základ (1×). */
const HUSTOTY = [
  ["mdpi", 1],
  ["hdpi", 1.5],
  ["xhdpi", 2],
  ["xxhdpi", 3],
  ["xxxhdpi", 4],
];

const zdroj = PNG.sync.read(readFileSync(PREDLOHA));

/** Bod z predlohy ako [r,g,b,a]. */
function bod(x, y) {
  const i = (zdroj.width * y + x) << 2;
  return [zdroj.data[i], zdroj.data[i + 1], zdroj.data[i + 2], zdroj.data[i + 3]];
}

/** Predloha zmenšená na `strana` bodov, najbližším susedom. */
function vzorka(strana, x, y) {
  const sx = Math.min(zdroj.width - 1, Math.floor((x * zdroj.width) / strana));
  const sy = Math.min(zdroj.height - 1, Math.floor((y * zdroj.height) / strana));
  return bod(sx, sy);
}

/** Prázdny obrázok s alfa kanálom. */
function plátno(w, h, farba = null) {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    p.data[j] = farba ? farba[0] : 0;
    p.data[j + 1] = farba ? farba[1] : 0;
    p.data[j + 2] = farba ? farba[2] : 0;
    p.data[j + 3] = farba ? 255 : 0;
  }
  return p;
}

/**
 * Vloží do stredu plátna samotný znak z predlohy — bez zeleného podkladu.
 * `celaPredloha` vypne oddelenie znaku (úvodná obrazovka chce logo tak, ako je).
 */
function vlozZnak(ciel, strana, kruh = false, lenZnak = true) {
  const posun = { x: (ciel.width - strana) >> 1, y: (ciel.height - strana) >> 1 };
  const stred = strana / 2;
  for (let y = 0; y < strana; y++) {
    for (let x = 0; x < strana; x++) {
      const [r, g, b, a] = vzorka(strana, x, y);
      if (!a) continue;
      if (lenZnak && r + g + b < PRAH_ZNAKU) continue;
      if (kruh) {
        const dx = x - stred;
        const dy = y - stred;
        if (Math.sqrt(dx * dx + dy * dy) > stred) continue;
      }
      const j = (ciel.width * (y + posun.y) + (x + posun.x)) * 4;
      ciel.data[j] = r;
      ciel.data[j + 1] = g;
      ciel.data[j + 2] = b;
      ciel.data[j + 3] = a;
    }
  }
}

/** Vyreže z obrázka kruh — všetko mimo neho je priehľadné. */
function orezNaKruh(p) {
  const stred = p.width / 2;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const dx = x + 0.5 - stred;
      const dy = y + 0.5 - stred;
      if (Math.sqrt(dx * dx + dy * dy) <= stred) continue;
      p.data[(p.width * y + x) * 4 + 3] = 0;
    }
  }
}

function zapis(cesta, png) {
  mkdirSync(cesta.slice(0, cesta.lastIndexOf("/")), { recursive: true });
  writeFileSync(cesta, PNG.sync.write(png));
}

let vyrobene = 0;

for (const [hustota, nasobok] of HUSTOTY) {
  // ── 1. Popredie prispôsobivej ikony: 108 dp, znak len v strednej časti ──
  const strana108 = Math.round(108 * nasobok);
  const popredie = plátno(strana108, strana108);
  // Z 108 dp je vidno stredných 72 dp — znak sa musí zmestiť do nich.
  vlozZnak(popredie, Math.round(strana108 * 0.66));
  zapis(`${RES}/mipmap-${hustota}/ic_launcher_foreground.png`, popredie);

  // ── 2. Staré ikony: 48 dp, znak na zelenom podklade ────────────────────
  const strana48 = Math.round(48 * nasobok);
  const stvorec = plátno(strana48, strana48, ZELENA);
  vlozZnak(stvorec, Math.round(strana48 * 0.62));
  zapis(`${RES}/mipmap-${hustota}/ic_launcher.png`, stvorec);

  const kruh = plátno(strana48, strana48, ZELENA);
  vlozZnak(kruh, Math.round(strana48 * 0.62));
  orezNaKruh(kruh);
  zapis(`${RES}/mipmap-${hustota}/ic_launcher_round.png`, kruh);

  // ── 3. Úvodná obrazovka, zvlášť na výšku a na šírku ────────────────────
  for (const [smer, w, h] of [
    ["port", Math.round(320 * nasobok), Math.round(480 * nasobok)],
    ["land", Math.round(480 * nasobok), Math.round(320 * nasobok)],
  ]) {
    const splash = plátno(w, h, ZELENA);
    vlozZnak(splash, Math.round(Math.min(w, h) * 0.34), false, false);
    zapis(`${RES}/drawable-${smer}-${hustota}/splash.png`, splash);
  }

  vyrobene += 5;
}

// Predvolená úvodná obrazovka pre zariadenia, ktoré si hustotu nevypýtajú.
const zaklad = plátno(480, 320, ZELENA);
vlozZnak(zaklad, 108, false, false);
zapis(`${RES}/drawable/splash.png`, zaklad);

// Ikona do obchodu: 512 × 512 a bez priehľadnosti — Play priehľadnú odmietne.
const obchod = plátno(512, 512, ZELENA);
vlozZnak(obchod, 320);
zapis(`${KOREN}public/play-store-icon.png`, obchod);

// Pozadie prispôsobivej ikony je značková zelená; znak je na nej biely.
writeFileSync(
  `${RES}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#007E46</color>\n</resources>\n`,
);

console.log(`✓ Vyrobených ${vyrobene + 1} obrázkov v ${RES.replace(KOREN, "")}`);
console.log("✓ Ikona do obchodu: public/play-store-icon.png (512 × 512)");
