/*
  PDF vyúčtovania výdavkov — súhrn na podpis zamestnanca a schvaľujúceho.
*/
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { RobotoRegularBase64 } from "./fonts/Roboto-Regular";
import { RobotoBoldBase64 } from "./fonts/Roboto-Bold";
import {
  nazovTypu,
  suhrnVyuctovania,
  type PolozkaVyuctovania,
  type TypVyuctovania,
} from "./vyuctovanie-vydavkov";

const A4 = { w: 595.28, h: 841.89 };
const M = 40;
const GREY = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.85, 0.85, 0.85);

const bajty = (b64: string) => Uint8Array.from(Buffer.from(b64, "base64"));
const cislo = (n: number) => n.toFixed(2).replace(".", ",");
const datum = (d?: string | null) =>
  d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}. ${d.slice(5, 7)}. ${d.slice(0, 4)}` : "—";
const UHRADA: Record<string, string> = { hotovost: "hotovosť", karta: "karta", prevod: "prevod" };

export type VyuctovanieNaPdf = {
  firma: {
    name: string;
    ico?: string | null;
    street?: string | null;
    zip?: string | null;
    city?: string | null;
  };
  nazov: string;
  typ: TypVyuctovania;
  zamestnanec: string | null;
  obdobieOd: string | null;
  obdobieDo: string | null;
  zaloha: number;
  mena: string;
  predkontacia: string | null;
  datumUctovania: string | null;
  poznamka: string | null;
  polozky: PolozkaVyuctovania[];
};

export async function pdfVyuctovania(v: VyuctovanieNaPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const reg = await pdf.embedFont(bajty(RobotoRegularBase64), { subset: true });
  const bold = await pdf.embedFont(bajty(RobotoBoldBase64), { subset: true });
  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const t = (
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
    t(s, x - (o.font ?? reg).widthOfTextAtSize(s, o.size ?? 9), yy, o);
  const skrat = (s: string, sirka: number, font = reg, size = 9) => {
    let x = s;
    while (x.length > 1 && font.widthOfTextAtSize(x, size) > sirka) x = x.slice(0, -1);
    return x.length < s.length ? `${x.slice(0, -1)}…` : x;
  };

  t(v.nazov, M, y, { size: 15, font: bold });
  y -= 18;
  t(nazovTypu(v.typ), M, y, { size: 10, color: GREY });
  y -= 24;

  const adresa = [v.firma.street, [v.firma.zip, v.firma.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const riadky: [string, string][] = [
    ["Firma", [v.firma.name, v.firma.ico ? `IČO ${v.firma.ico}` : ""].filter(Boolean).join(", ")],
    ["Adresa", adresa || "—"],
    ["Zamestnanec", v.zamestnanec || "—"],
    ["Obdobie", v.obdobieOd || v.obdobieDo ? `${datum(v.obdobieOd)} – ${datum(v.obdobieDo)}` : "—"],
  ];
  if (v.predkontacia || v.datumUctovania)
    riadky.push([
      "Účtovanie",
      [v.predkontacia, v.datumUctovania ? `dátum ${datum(v.datumUctovania)}` : ""]
        .filter(Boolean)
        .join(", "),
    ]);
  for (const [k, h] of riadky) {
    t(k, M, y, { color: GREY });
    t(skrat(h, A4.w - 2 * M - 90), M + 90, y);
    y -= 14;
  }
  y -= 10;

  // Tabuľka položiek
  const st = {
    d: M,
    dod: M + 62,
    cis: M + 230,
    uh: M + 315,
    zakl: A4.w - M - 130,
    dph: A4.w - M - 65,
    sp: A4.w - M,
  };
  const hlavicka = () => {
    t("Dátum", st.d, y, { font: bold, size: 8 });
    t("Dodávateľ", st.dod, y, { font: bold, size: 8 });
    t("Číslo dokladu", st.cis, y, { font: bold, size: 8 });
    t("Úhrada", st.uh, y, { font: bold, size: 8 });
    vpravo("Základ", st.zakl, y, { font: bold, size: 8 });
    vpravo("DPH", st.dph, y, { font: bold, size: 8 });
    vpravo("Spolu", st.sp, y, { font: bold, size: 8 });
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.6, color: LINE });
    y -= 12;
  };
  hlavicka();
  const zoradene = [...v.polozky].sort((a, b) =>
    String(a.datum ?? "").localeCompare(String(b.datum ?? "")),
  );
  for (const p of zoradene) {
    if (y < M + 170) {
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - M;
      hlavicka();
    }
    t(datum(p.datum), st.d, y, { size: 8 });
    t(skrat(p.dodavatel ?? "—", st.cis - st.dod - 6, reg, 8), st.dod, y, { size: 8 });
    t(skrat(p.cislo ?? "—", st.uh - st.cis - 6, reg, 8), st.cis, y, { size: 8 });
    t(UHRADA[p.sposobUhrady ?? ""] ?? p.sposobUhrady ?? "—", st.uh, y, { size: 8 });
    const ina = (p.mena || "EUR") !== v.mena ? ` ${p.mena}` : "";
    vpravo(cislo(p.zaklad), st.zakl, y, { size: 8 });
    vpravo(cislo(p.dph), st.dph, y, { size: 8 });
    vpravo(cislo(p.spolu) + ina, st.sp, y, { size: 8 });
    y -= 13;
  }
  page.drawLine({
    start: { x: M, y: y + 4 },
    end: { x: A4.w - M, y: y + 4 },
    thickness: 0.6,
    color: LINE,
  });
  y -= 10;

  const s = suhrnVyuctovania(v.polozky, v.typ, v.zaloha, v.mena);
  const sucet = (k: string, h: string, f: PDFFont = reg) => {
    t(k, st.uh, y, { font: f });
    vpravo(h, st.sp, y, { font: f });
    y -= 14;
  };
  sucet(`Doklady spolu (${s.pocet})`, `${cislo(s.spolu)} ${v.mena}`, bold);
  sucet("z toho DPH", `${cislo(s.dph)} ${v.mena}`);
  if (v.typ === "zaloha") sucet("Poskytnutá záloha", `${cislo(s.zaloha)} ${v.mena}`);
  if (s.inaMena) sucet(`Doklady v inej mene (mimo súčtu)`, String(s.inaMena));
  y -= 4;
  t(s.vysledok, M, y, { font: bold, size: 11 });
  y -= 22;
  if (v.poznamka) {
    t("Poznámka:", M, y, { color: GREY });
    t(skrat(v.poznamka, A4.w - 2 * M - 60), M + 60, y);
    y -= 20;
  }

  // Podpisy
  y = Math.min(y - 30, M + 90);
  const podpis = (x: number, popis: string) => {
    page.drawLine({ start: { x, y }, end: { x: x + 200, y }, thickness: 0.6, color: rgb(0, 0, 0) });
    t(popis, x, y - 12, { size: 8, color: GREY });
  };
  podpis(M, "Podpis zamestnanca a dátum");
  podpis(A4.w - M - 200, "Schválil (meno, podpis, dátum)");

  const strany = pdf.getPages();
  strany.forEach((p, i) =>
    p.drawText(`Faktero · ${v.nazov} · strana ${i + 1}/${strany.length}`, {
      x: M,
      y: 20,
      size: 7,
      font: reg,
      color: GREY,
    }),
  );
  return pdf.save();
}
