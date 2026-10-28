/*
  E-mail bez dokladu ako PDF — keď má firma zapnuté „Ukladať aj e-maily bez
  dokladu“, mail bez prílohy (faktúra v texte, odkaz na stiahnutie) sa uloží
  do Nespracovaných. Nespracovaný doklad potrebuje súbor, preto sa z hlavičky
  a textu mailu vyrobí jednoduché PDF.
*/
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { RobotoRegularBase64 } from "./fonts/Roboto-Regular";
import { RobotoBoldBase64 } from "./fonts/Roboto-Bold";

const A4 = { w: 595.28, h: 841.89 };
const M = 48;
const bajty = (b64: string) => Uint8Array.from(Buffer.from(b64, "base64"));

/** Riadky textu zalomené na šírku (slová, inak tvrdý zlom dlhého reťazca). */
export function zalomRiadky(text: string, sirka: number, font: PDFFont, size: number): string[] {
  const out: string[] = [];
  for (const odsek of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!odsek.trim()) {
      out.push("");
      continue;
    }
    let riadok = "";
    for (const slovo of odsek.split(/\s+/)) {
      const skusa = riadok ? `${riadok} ${slovo}` : slovo;
      if (font.widthOfTextAtSize(skusa, size) <= sirka) {
        riadok = skusa;
        continue;
      }
      if (riadok) out.push(riadok);
      // Slovo dlhšie než riadok (odkaz) sa láme po znakoch.
      let zvysok = slovo;
      while (font.widthOfTextAtSize(zvysok, size) > sirka) {
        let n = zvysok.length;
        while (n > 1 && font.widthOfTextAtSize(zvysok.slice(0, n), size) > sirka) n--;
        out.push(zvysok.slice(0, n));
        zvysok = zvysok.slice(n);
      }
      riadok = zvysok;
    }
    out.push(riadok);
  }
  return out;
}

/** Znaky, ktoré Roboto nemá (emoji a pod.), by zhodili kreslenie — nahradia sa. */
function bezNeznamych(s: string, font: PDFFont): string {
  let out = "";
  for (const ch of s) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

export async function pdfZMailu(m: {
  od: string | null;
  komu: string | null;
  predmet: string | null;
  prijate: string;
  text: string | null;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const reg = await pdf.embedFont(bajty(RobotoRegularBase64), { subset: true });
  const bold = await pdf.embedFont(bajty(RobotoBoldBase64), { subset: true });
  pdf.setTitle(m.predmet || "E-mail");
  let page = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const sirka = A4.w - 2 * M;

  const kresli = (s: string, font: PDFFont, size: number, farba = rgb(0, 0, 0)) => {
    for (const r of zalomRiadky(bezNeznamych(s, font), sirka, font, size)) {
      if (y < M + size) {
        page = pdf.addPage([A4.w, A4.h]);
        y = A4.h - M;
      }
      if (r) page.drawText(r, { x: M, y, size, font, color: farba });
      y -= size * 1.4;
    }
  };

  kresli(m.predmet || "(bez predmetu)", bold, 14);
  y -= 4;
  const siva = rgb(0.4, 0.4, 0.4);
  if (m.od) kresli(`Od: ${m.od}`, reg, 9, siva);
  if (m.komu) kresli(`Komu: ${m.komu}`, reg, 9, siva);
  kresli(`Prijaté: ${m.prijate}`, reg, 9, siva);
  y -= 6;
  page.drawLine({
    start: { x: M, y: y + 6 },
    end: { x: A4.w - M, y: y + 6 },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 8;
  kresli((m.text ?? "").slice(0, 50000) || "(prázdny mail)", reg, 10);
  return pdf.save();
}
