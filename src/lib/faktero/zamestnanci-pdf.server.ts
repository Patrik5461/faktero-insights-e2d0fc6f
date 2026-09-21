/**
 * PDF pre modul Zamestnanci — dokumenty zo šablón a mesačný výkaz dochádzky.
 *
 * Tá istá vrstva ako faktúry: `pdf-lib` s písmom Roboto, aby sedela
 * diakritika. Faktúra má pevné rozloženie, tu je súvislý text, preto vlastné
 * zalamovanie riadkov a stránok.
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { RobotoRegularBase64 } from "./fonts/Roboto-Regular";
import { RobotoBoldBase64 } from "./fonts/Roboto-Bold";
import { DRUH_NEPRITOMNOSTI, type DruhNepritomnosti, type SuhrnZamestnanca } from "./zamestnanci";

function b64ToBytes(b64: string): Uint8Array {
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const A4: [number, number] = [595.28, 841.89];
const OKRAJ = 56;
const SIVA = rgb(0.35, 0.35, 0.35);

async function novyDokument() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(b64ToBytes(RobotoRegularBase64), { subset: true });
  const bold = await doc.embedFont(b64ToBytes(RobotoBoldBase64), { subset: true });
  return { doc, font, bold };
}

/** Rozdelí odsek na riadky, ktoré sa zmestia do šírky. */
function zalom(text: string, font: PDFFont, velkost: number, sirka: number): string[] {
  if (!text) return [""];
  const riadky: string[] = [];
  let aktualny = "";
  for (const slovo of text.split(/(\s+)/)) {
    const skusobny = aktualny + slovo;
    if (font.widthOfTextAtSize(skusobny, velkost) <= sirka || !aktualny.trim()) {
      aktualny = skusobny;
    } else {
      riadky.push(aktualny.trimEnd());
      aktualny = slovo.trimStart();
    }
  }
  riadky.push(aktualny.trimEnd());
  return riadky;
}

/**
 * Dokument zo šablóny. Riadok začínajúci „# “ je nadpis, prázdny riadok je
 * medzera; ostatné sa zalamujú. Viac medzier za sebou (podpisové čiary) sa
 * nechá tak, ako je.
 */
export async function dokumentZoSablonyPdf(text: string, paticka: string): Promise<Uint8Array> {
  const { doc, font, bold } = await novyDokument();
  const sirka = A4[0] - OKRAJ * 2;
  let strana: PDFPage = doc.addPage(A4);
  let y = A4[1] - OKRAJ;

  const novaStrana = () => {
    strana = doc.addPage(A4);
    y = A4[1] - OKRAJ;
  };

  for (const surovy of text.replace(/\r\n/g, "\n").split("\n")) {
    const nadpis = surovy.startsWith("# ");
    const velkost = nadpis ? 15 : 10.5;
    const f = nadpis ? bold : font;
    const vyska = velkost * 1.45;
    const obsah = nadpis ? surovy.slice(2).trim() : surovy;

    if (!obsah.trim()) {
      y -= vyska * 0.6;
      continue;
    }
    for (const riadok of zalom(obsah, f, velkost, sirka)) {
      if (y - vyska < OKRAJ + 20) novaStrana();
      const x = nadpis ? (A4[0] - f.widthOfTextAtSize(riadok, velkost)) / 2 : OKRAJ;
      strana.drawText(riadok, { x, y: y - velkost, size: velkost, font: f });
      y -= vyska;
    }
    if (nadpis) y -= 6;
  }

  const strany = doc.getPages();
  strany.forEach((s, i) => {
    const t = `${paticka} · strana ${i + 1} z ${strany.length}`;
    s.drawText(t, { x: OKRAJ, y: OKRAJ - 24, size: 8, font, color: SIVA });
  });
  return doc.save();
}

/** Mesačný výkaz dochádzky a neprítomností — na šírku, jedna tabuľka. */
export async function vykazDochadzkyPdf(args: {
  firma: string;
  mesiac: string;
  suhrn: SuhrnZamestnanca[];
}): Promise<Uint8Array> {
  const { doc, font, bold } = await novyDokument();
  const na_sirku: [number, number] = [A4[1], A4[0]];
  const druhy = (Object.keys(DRUH_NEPRITOMNOSTI) as DruhNepritomnosti[]).filter((k) =>
    args.suhrn.some((s) => s.nepritomnosti[k] > 0),
  );
  const stlpce = [
    { nadpis: "Zamestnanec", sirka: 200 },
    { nadpis: "Odprac. dni", sirka: 70 },
    { nadpis: "Hodiny", sirka: 60 },
    ...druhy.map((k) => ({ nadpis: `${DRUH_NEPRITOMNOSTI[k]} (dni)`, sirka: 78 })),
  ];

  let strana = doc.addPage(na_sirku);
  let y = na_sirku[1] - OKRAJ;
  const [r, m] = args.mesiac.split("-");
  strana.drawText(`Výkaz dochádzky a neprítomností — ${Number(m)}/${r}`, { x: OKRAJ, y, size: 15, font: bold });
  y -= 20;
  strana.drawText(args.firma, { x: OKRAJ, y, size: 10, font, color: SIVA });
  y -= 28;

  const hlavicka = () => {
    let x = OKRAJ;
    for (const s of stlpce) {
      strana.drawText(s.nadpis, { x, y, size: 8.5, font: bold });
      x += s.sirka;
    }
    y -= 6;
    strana.drawLine({ start: { x: OKRAJ, y }, end: { x: na_sirku[0] - OKRAJ, y }, thickness: 0.6, color: SIVA });
    y -= 14;
  };
  hlavicka();

  const cislo = (n: number) => String(n).replace(".", ",");
  let spoluDni = 0;
  let spoluHodiny = 0;
  for (const s of args.suhrn) {
    if (y < OKRAJ + 30) {
      strana = doc.addPage(na_sirku);
      y = na_sirku[1] - OKRAJ;
      hlavicka();
    }
    const hodnoty = [s.meno, String(s.odpracovaneDni), cislo(s.hodiny), ...druhy.map((k) => cislo(s.nepritomnosti[k]))];
    let x = OKRAJ;
    hodnoty.forEach((h, i) => {
      strana.drawText(zalom(h, font, 9.5, stlpce[i].sirka - 8)[0], { x, y, size: 9.5, font });
      x += stlpce[i].sirka;
    });
    spoluDni += s.odpracovaneDni;
    spoluHodiny += s.hodiny;
    y -= 16;
  }
  if (args.suhrn.length === 0) {
    strana.drawText("V tomto mesiaci nie je zapísaná žiadna dochádzka ani neprítomnosť.", { x: OKRAJ, y, size: 10, font, color: SIVA });
  } else {
    strana.drawLine({ start: { x: OKRAJ, y: y + 10 }, end: { x: na_sirku[0] - OKRAJ, y: y + 10 }, thickness: 0.6, color: SIVA });
    strana.drawText("Spolu", { x: OKRAJ, y: y - 4, size: 9.5, font: bold });
    strana.drawText(String(spoluDni), { x: OKRAJ + stlpce[0].sirka, y: y - 4, size: 9.5, font: bold });
    strana.drawText(cislo(Math.round(spoluHodiny * 100) / 100), { x: OKRAJ + stlpce[0].sirka + stlpce[1].sirka, y: y - 4, size: 9.5, font: bold });
  }
  return doc.save();
}
