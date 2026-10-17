/*
  PDF prehľadu UStVA — jedna strana s Kennzahlen na odovzdanie poradcovi
  alebo na prepis do ELSTER. Popisy prekladá volajúci (jazyk webu).
*/
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { RobotoRegularBase64 } from "./fonts/Roboto-Regular";
import { RobotoBoldBase64 } from "./fonts/Roboto-Bold";
import { RIADKY_USTVA, type Ustva } from "./ustva";

const A4 = { w: 595.28, h: 841.89 };
const M = 40;
const GREY = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.85, 0.85, 0.85);

const bajty = (b64: string) => Uint8Array.from(Buffer.from(b64, "base64"));
/** Nemecký zápis sumy: 1.234,56. */
const eur = (n: number | undefined) =>
  n == null
    ? ""
    : n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function pdfUstva(v: {
  ustva: Ustva;
  firma: string;
  obdobie: string;
  preloz: (s: string) => string;
}): Promise<Uint8Array> {
  const t = v.preloz;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const reg = await pdf.embedFont(bajty(RobotoRegularBase64), { subset: true });
  const bold = await pdf.embedFont(bajty(RobotoBoldBase64), { subset: true });
  const page = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const text = (
    s: string,
    x: number,
    yy: number,
    o: { size?: number; font?: PDFFont; color?: any } = {},
  ) =>
    page.drawText(s, {
      x,
      y: yy,
      size: o.size ?? 9,
      font: o.font ?? reg,
      color: o.color ?? rgb(0, 0, 0),
    });
  const vpravo = (s: string, x: number, yy: number, o: { size?: number; font?: PDFFont } = {}) =>
    text(s, x - (o.font ?? reg).widthOfTextAtSize(s, o.size ?? 9), yy, o);
  const skrat = (s: string, sirka: number) => {
    let x = s;
    while (x.length > 1 && reg.widthOfTextAtSize(x, 9) > sirka) x = x.slice(0, -1);
    return x.length < s.length ? `${x.slice(0, -1)}…` : x;
  };

  text(t("Prehľad UStVA"), M, y, { size: 15, font: bold });
  y -= 18;
  text(`${v.firma} · ${v.obdobie}`, M, y, { size: 10, color: GREY });
  y -= 26;

  const st = { kz: M, popis: M + 40, zaklad: A4.w - M - 110, dan: A4.w - M };
  text("KZ", st.kz, y, { font: bold, size: 8 });
  text(t("Popis"), st.popis, y, { font: bold, size: 8 });
  vpravo(t("Základ dane"), st.zaklad, y, { font: bold, size: 8 });
  vpravo(t("Daň"), st.dan, y, { font: bold, size: 8 });
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.6, color: LINE });
  y -= 13;

  const lenDan = new Set(["66", "61", "62", "67", "64", "69", "39", "83"]);
  let skupina = "";
  for (const r of RIADKY_USTVA) {
    const zaklad = v.ustva.kz[r.kz];
    const dan =
      r.danKz === "vypocet"
        ? v.ustva.danKZakladu[r.kz as "81" | "86" | "89" | "93"]
        : r.danKz
          ? v.ustva.kz[r.danKz]
          : undefined;
    if (zaklad == null && dan == null && r.kz !== "83") continue;
    if (r.skupina !== skupina) {
      skupina = r.skupina;
      y -= 4;
      text(t(skupina), M, y, { font: bold, size: 8, color: GREY });
      y -= 13;
    }
    const tucne = r.kz === "83";
    text(r.kz, st.kz, y, { font: tucne ? bold : reg });
    text(skrat(t(r.popis), st.zaklad - st.popis - 80), st.popis, y, { font: tucne ? bold : reg });
    if (lenDan.has(r.kz) && !r.danKz)
      vpravo(eur(zaklad ?? 0), st.dan, y, { font: tucne ? bold : reg });
    else {
      vpravo(eur(zaklad), st.zaklad, y);
      vpravo(eur(dan), st.dan, y);
    }
    y -= 14;
  }
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.6, color: LINE });
  y -= 14;
  text(t("Daň spolu"), st.popis, y);
  vpravo(eur(v.ustva.danSpolu), st.dan, y);
  y -= 14;
  text(t("Odpočet dane spolu"), st.popis, y);
  vpravo(eur(v.ustva.vorsteuerSpolu), st.dan, y);
  y -= 24;
  const pozn = t(
    "Prehľad zostavený z dokladov vo Fakteri. Podáva sa cez ELSTER; základy dane sú v celých eurách, daň na centy.",
  );
  text(skrat(pozn, A4.w - 2 * M), M, y, { size: 8, color: GREY });
  if (v.ustva.vytky.length) {
    y -= 18;
    text(t("Pred podaním skontrolujte"), M, y, { size: 9, font: bold });
    for (const x of v.ustva.vytky.slice(0, 20)) {
      y -= 12;
      if (y < M) break;
      text(skrat(`${x.doklad}: ${t(x.text)}`, A4.w - 2 * M), M, y, { size: 8 });
    }
  }
  return pdf.save();
}
