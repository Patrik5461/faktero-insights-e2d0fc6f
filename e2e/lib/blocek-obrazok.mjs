/*
  Umelé fotky dokladov pre toky appky: biely papier na tmavom stole, mierne
  pootočený (aby mala čo robiť detekcia okrajov a vyrovnanie), riadky textu a
  QR kód. Kreslí sa cez @napi-rs/canvas, QR cez knižnicu `qrcode` — obe sú v
  node_modules repa.
*/
import { createRequire } from "node:module";
import { cestaModulu } from "./prostredie.mjs";

const req = createRequire(import.meta.url);

/**
 * PNG s bločkom. `qr` = obsah QR kódu (null = bez kódu), `riadky` = text na papieri.
 * `uhol` v stupňoch pootočí papier, `sirka`×`vyska` je celá fotka.
 */
export async function fotkaBlocku({
  qr = null,
  riadky = [],
  uhol = 4,
  sirka = 900,
  vyska = 1300,
  pozadie = "#3b3f46",
} = {}) {
  const { createCanvas, loadImage } = req(cestaModulu("@napi-rs/canvas"));
  const QRCode = req(cestaModulu("qrcode"));
  const c = createCanvas(sirka, vyska);
  const g = c.getContext("2d");
  g.fillStyle = pozadie;
  g.fillRect(0, 0, sirka, vyska);
  // Papier: 62 % šírky, 78 % výšky, v strede, pootočený.
  const pw = Math.round(sirka * 0.62);
  const ph = Math.round(vyska * 0.78);
  g.save();
  g.translate(sirka / 2, vyska / 2);
  g.rotate((uhol * Math.PI) / 180);
  g.fillStyle = "#fbfbf7";
  g.fillRect(-pw / 2, -ph / 2, pw, ph);
  g.fillStyle = "#111";
  g.font = "bold 30px sans-serif";
  let y = -ph / 2 + 60;
  for (const [i, r] of riadky.entries()) {
    g.font = i === 0 ? "bold 30px sans-serif" : "24px sans-serif";
    g.fillText(r, -pw / 2 + 36, y);
    y += i === 0 ? 50 : 38;
  }
  if (qr) {
    const url = await QRCode.toDataURL(qr, { margin: 2, width: 300, errorCorrectionLevel: "M" });
    const img = await loadImage(Buffer.from(url.split(",")[1], "base64"));
    const q = Math.min(300, pw - 80);
    g.drawImage(img, -q / 2, ph / 2 - q - 40, q, q);
  }
  g.restore();
  return c.toBuffer("image/png");
}

/** Samotný QR kód (na podstrčenie do „kamery“ pri skenovaní QR). */
export async function obrazokQr(qr, velkost = 480) {
  const QRCode = req(cestaModulu("qrcode"));
  return QRCode.toBuffer(qr, { margin: 4, width: velkost, errorCorrectionLevel: "M" });
}

/** Český QR EET (formát ako na účtenke, DT = YYYYMMDDhhmm). */
export function qrEet({ bkp = "01234567-89abcdef", dic = "45316872", kc, dt }) {
  return `EET*1.0*BKP:${bkp}*DIC:${dic}*KC:${kc}*DT:${dt}*R:B*`;
}

/**
 * Náhrada kamery v prehliadači: `getUserMedia` vráti prúd z plátna, na
 * ktorom je zadaný obrázok (data URL). Skener v appke z neho číta QR aj
 * hľadá obrys dokladu presne ako zo skutočnej kamery. Obrázok sa dá
 * vymeniť za behu cez `window.__e2eKamera(dataUrl)`.
 */
export async function falosnaKamera(page, dataUrl) {
  await page.addInitScript((pociatocny) => {
    let aktualny = pociatocny;
    window.__e2eKamera = (u) => {
      aktualny = u;
    };
    const povodne = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (!navigator.mediaDevices) return;
    navigator.mediaDevices.getUserMedia = async (obm) => {
      if (!obm?.video) return povodne(obm);
      const c = document.createElement("canvas");
      c.width = 1280;
      c.height = 960;
      const g = c.getContext("2d");
      const img = new Image();
      let nacitany = null;
      const kresli = () => {
        if (nacitany !== aktualny) {
          nacitany = aktualny;
          img.src = aktualny;
        }
        g.fillStyle = "#3b3f46";
        g.fillRect(0, 0, c.width, c.height);
        if (img.complete && img.naturalWidth) {
          const k = Math.min(c.width / img.naturalWidth, c.height / img.naturalHeight);
          const w = img.naturalWidth * k;
          const h = img.naturalHeight * k;
          g.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
        }
      };
      kresli();
      setInterval(kresli, 100);
      return c.captureStream(10);
    };
  }, dataUrl);
}

/** Prázdny záber (tmavý stôl bez dokladu) — kamera beží, ale nemá čo prečítať ani odfotiť. */
export async function prazdnyZaber() {
  const { createCanvas } = req(cestaModulu("@napi-rs/canvas"));
  const c = createCanvas(640, 480);
  const g = c.getContext("2d");
  g.fillStyle = "#3b3f46";
  g.fillRect(0, 0, 640, 480);
  return c.toBuffer("image/png");
}
