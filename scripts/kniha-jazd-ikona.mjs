/**
 * Nakreslí ikonu samostatnej appky Kniha jázd.
 *
 * Faktero má hotovú ikonu ako obrázok; táto appka žiadnu nemala. Kresliť ju
 * kódom má tú výhodu, že sa dá kedykoľvek prekresliť do ľubovoľnej veľkosti
 * bez rozmazania — a že je zdroj presne jeden.
 *
 * Prečo iná farba než Faktero: obe appky môžu byť na tom istom telefóne vedľa
 * seba. Keby mali obe zelený štvorec, človek by ich od seba na ploche
 * nerozoznal. Znak je trasa s odjazdom a cieľom — to, čo appka robí.
 *
 * Vyrobí dva súbory:
 *   public/kniha-jazd-icon.png     hotová ikona (podklad + znak) — obchod, iOS
 *   public/kniha-jazd-icon-fg.png  samotný znak na priehľadnom — prispôsobivá ikona
 *
 * Spustenie: node scripts/kniha-jazd-ikona.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const STRANA = 1024;
/** Kreslíme väčšie a potom zmenšíme — takto vzniknú hladké okraje bez knižnice. */
const NASOBOK = 3;
const V = STRANA * NASOBOK;

/** Asfaltová sivá. Musí sedieť so `SplashScreen.backgroundColor` v capacitor.config.jazdy.ts. */
export const PODKLAD = [0x1f, 0x2a, 0x33];

/** Body v pomere k strane, aby sa dala ikona nakresliť v akejkoľvek veľkosti. */
const TRASA = [
  [0.25, 0.77],
  [0.84, 0.63],
  [0.18, 0.4],
  [0.75, 0.25],
];
const HRUBKA = 0.105; // šírka čiary trasy
const ODJAZD = 0.095; // polomer bodky na začiatku
const CIEL_VONKAJSI = 0.135; // krúžok cieľa
const CIEL_VNUTORNY = 0.058;
const ZAOBLENIE = 0.225; // rohy podkladu

const znak = new Uint8Array(V * V);
const podklad = new Uint8Array(V * V);

function bod(t) {
  const s = 1 - t;
  const [a, b, c, d] = TRASA;
  return [
    (s * s * s * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t * t * t * d[0]) * V,
    (s * s * s * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t * t * t * d[1]) * V,
  ];
}

/** Kruh do masky. `von` maže — tak vznikne dierka v krúžku cieľa. */
function kruh(maska, sx, sy, r, von = false) {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(sx - r));
  const x1 = Math.min(V - 1, Math.ceil(sx + r));
  const y0 = Math.max(0, Math.floor(sy - r));
  const y1 = Math.min(V - 1, Math.ceil(sy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - sx;
      const dy = y + 0.5 - sy;
      if (dx * dx + dy * dy > r2) continue;
      maska[V * y + x] = von ? 0 : 1;
    }
  }
}

// ── Podklad: zaoblený štvorec ─────────────────────────────────────────────
{
  const r = ZAOBLENIE * V;
  for (let y = 0; y < V; y++) {
    for (let x = 0; x < V; x++) {
      // Vzdialenosť od zaobleného obdĺžnika: mimo rohov je to bežný štvorec.
      const dx = Math.max(r - (x + 0.5), x + 0.5 - (V - r), 0);
      const dy = Math.max(r - (y + 0.5), y + 0.5 - (V - r), 0);
      if (dx * dx + dy * dy <= r * r) podklad[V * y + x] = 1;
    }
  }
}

// ── Znak: trasa, bodka odjazdu, krúžok cieľa ──────────────────────────────
{
  const polomer = (HRUBKA / 2) * V;
  // Krok po krivke menší než polomer, inak by čiara vyšla ako reťaz korálok.
  for (let i = 0; i <= 900; i++) {
    const [x, y] = bod(i / 900);
    kruh(znak, x, y, polomer);
  }
  const [zx, zy] = bod(0);
  const [kx, ky] = bod(1);
  kruh(znak, zx, zy, ODJAZD * V);
  kruh(znak, kx, ky, CIEL_VONKAJSI * V);
  kruh(znak, kx, ky, CIEL_VNUTORNY * V, true);
}

/** Zmenší masku na `STRANA` spriemerovaním — z toho vznikne hladký okraj. */
function zmensi(maska) {
  const out = new Float32Array(STRANA * STRANA);
  const plocha = NASOBOK * NASOBOK;
  for (let y = 0; y < STRANA; y++) {
    for (let x = 0; x < STRANA; x++) {
      let suma = 0;
      for (let dy = 0; dy < NASOBOK; dy++) {
        const rad = V * (y * NASOBOK + dy) + x * NASOBOK;
        for (let dx = 0; dx < NASOBOK; dx++) suma += maska[rad + dx];
      }
      out[STRANA * y + x] = suma / plocha;
    }
  }
  return out;
}

const aZnak = zmensi(znak);
const aPodklad = zmensi(podklad);

function zapis(cesta, png) {
  writeFileSync(cesta, PNG.sync.write(png));
  console.log(`✓ ${cesta}`);
}

// Hotová ikona: znak vpísaný do podkladu.
const ikona = new PNG({ width: STRANA, height: STRANA });
for (let i = 0; i < STRANA * STRANA; i++) {
  const z = aZnak[i];
  const j = i * 4;
  for (let k = 0; k < 3; k++) ikona.data[j + k] = Math.round(PODKLAD[k] * (1 - z) + 255 * z);
  ikona.data[j + 3] = Math.round(aPodklad[i] * 255);
}
zapis("public/kniha-jazd-icon.png", ikona);

// Samotný znak pre prispôsobivú ikonu Androidu.
const popredie = new PNG({ width: STRANA, height: STRANA });
for (let i = 0; i < STRANA * STRANA; i++) {
  const j = i * 4;
  popredie.data[j] = 255;
  popredie.data[j + 1] = 255;
  popredie.data[j + 2] = 255;
  popredie.data[j + 3] = Math.round(aZnak[i] * 255);
}
zapis("public/kniha-jazd-icon-fg.png", popredie);
