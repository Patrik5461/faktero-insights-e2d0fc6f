/**
 * PDF „Firmy na eFaktúre“ pre administráciu — ktorá firma je u nás cez
 * eFaktúru a v akom rozsahu (odosielanie aj prijímanie, len odosielanie…).
 * Rovnaká vrstva ako ostatné PDF: `pdf-lib` s písmom Roboto kvôli diakritike.
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { RobotoRegularBase64 } from "./fonts/Roboto-Regular";
import { RobotoBoldBase64 } from "./fonts/Roboto-Bold";
import { NAZOV_ROZSAHU, PORADIE_ROZSAHU, type RozsahEfaktury } from "./efaktura-rozsah-firiem";

export type RiadokPrehladu = {
  firma: string;
  ico: string | null;
  dic: string | null;
  peppolId: string | null;
  rozsah: RozsahEfaktury;
  poznamka: string | null;
  od: string | null;
  odoslanych: number;
  prijatych: number;
};

function b64ToBytes(b64: string): Uint8Array {
  const bin =
    typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Na šírku — stĺpcov je veľa.
const STRANA: [number, number] = [841.89, 595.28];
const OKRAJ = 36;
const SIVA = rgb(0.4, 0.4, 0.4);
const LINKA = rgb(0.85, 0.85, 0.85);
const ZELENA = rgb(0.07, 0.45, 0.31);

const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("sk-SK") : "—");

/** Skráti text na šírku stĺpca (s „…“). */
function orez(t: string, font: PDFFont, velkost: number, sirka: number): string {
  if (font.widthOfTextAtSize(t, velkost) <= sirka) return t;
  let s = t;
  while (s.length > 1 && font.widthOfTextAtSize(s + "…", velkost) > sirka) s = s.slice(0, -1);
  return s + "…";
}

const STLPCE: { nazov: string; sirka: number; zarovnaj?: "vpravo" }[] = [
  { nazov: "Firma", sirka: 140 },
  { nazov: "IČO", sirka: 62 },
  { nazov: "DIČ", sirka: 70 },
  { nazov: "Peppol ID", sirka: 92 },
  { nazov: "Rozsah", sirka: 130 },
  { nazov: "Poznámka", sirka: 104 },
  { nazov: "Od", sirka: 56 },
  { nazov: "Odoslané", sirka: 40, zarovnaj: "vpravo" },
  { nazov: "Prijaté", sirka: 40, zarovnaj: "vpravo" },
];

export async function prehladEfakturyPdf(
  riadky: RiadokPrehladu[],
  vytvorene = new Date(),
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(b64ToBytes(RobotoRegularBase64), { subset: true });
  const bold = await doc.embedFont(b64ToBytes(RobotoBoldBase64), { subset: true });
  doc.setTitle("Firmy na eFaktúre");
  doc.setAuthor("Faktero");

  let strana: PDFPage = doc.addPage(STRANA);
  let y = STRANA[1] - OKRAJ;
  const text = (
    t: string,
    x: number,
    yy: number,
    o: { f?: PDFFont; v?: number; c?: ReturnType<typeof rgb> } = {},
  ) =>
    strana.drawText(t, {
      x,
      y: yy,
      size: o.v ?? 9,
      font: o.f ?? font,
      color: o.c ?? rgb(0.1, 0.1, 0.1),
    });

  // Hlavička a súhrn.
  text("Firmy na eFaktúre", OKRAJ, y - 16, { f: bold, v: 18, c: ZELENA });
  text(`Faktero · stav k ${vytvorene.toLocaleString("sk-SK")}`, OKRAJ, y - 32, { c: SIVA });
  y -= 56;
  const pocty = new Map<RozsahEfaktury, number>();
  for (const r of riadky) pocty.set(r.rozsah, (pocty.get(r.rozsah) ?? 0) + 1);
  let x = OKRAJ;
  for (const k of PORADIE_ROZSAHU.filter((r) => r !== "bez_portalu")) {
    const t = `${NAZOV_ROZSAHU[k]}: ${pocty.get(k) ?? 0}`;
    text(t, x, y, { f: k === "odosielanie_prijimanie" || k === "len_odosielanie" ? bold : font });
    x += font.widthOfTextAtSize(t, 9) + 18;
  }
  y -= 14;
  text(
    "Odosielanie aj prijímanie = firma si Faktero vybrala za poštára na portáli FS. Len odosielanie = faktúry posiela z Faktera, prijíma u iného poskytovateľa.",
    OKRAJ,
    y,
    { v: 7.5, c: SIVA },
  );
  y -= 20;

  const hlavickaTabulky = () => {
    let cx = OKRAJ;
    for (const s of STLPCE) {
      const w = bold.widthOfTextAtSize(s.nazov, 8);
      text(s.nazov, s.zarovnaj === "vpravo" ? cx + s.sirka - w : cx, y, { f: bold, v: 8, c: SIVA });
      cx += s.sirka + 4;
    }
    y -= 6;
    strana.drawLine({
      start: { x: OKRAJ, y },
      end: { x: STRANA[0] - OKRAJ, y },
      thickness: 0.8,
      color: LINKA,
    });
    y -= 12;
  };
  hlavickaTabulky();

  const zoradene = [...riadky].sort(
    (a, b) =>
      PORADIE_ROZSAHU.indexOf(a.rozsah) - PORADIE_ROZSAHU.indexOf(b.rozsah) ||
      a.firma.localeCompare(b.firma, "sk"),
  );
  for (const r of zoradene) {
    if (y < OKRAJ + 20) {
      strana = doc.addPage(STRANA);
      y = STRANA[1] - OKRAJ;
      hlavickaTabulky();
    }
    const hodnoty = [
      r.firma,
      r.ico ?? "—",
      r.dic ?? "—",
      r.peppolId ?? "—",
      NAZOV_ROZSAHU[r.rozsah],
      r.poznamka ?? "",
      datum(r.od),
      String(r.odoslanych),
      String(r.prijatych),
    ];
    let cx = OKRAJ;
    STLPCE.forEach((s, i) => {
      const f =
        i === 4 && (r.rozsah === "odosielanie_prijimanie" || r.rozsah === "len_odosielanie")
          ? bold
          : font;
      const t = orez(hodnoty[i], f, 8.5, s.sirka);
      const w = f.widthOfTextAtSize(t, 8.5);
      text(t, s.zarovnaj === "vpravo" ? cx + s.sirka - w : cx, y, { f, v: 8.5 });
      cx += s.sirka + 4;
    });
    y -= 6;
    strana.drawLine({
      start: { x: OKRAJ, y },
      end: { x: STRANA[0] - OKRAJ, y },
      thickness: 0.4,
      color: LINKA,
    });
    y -= 12;
  }
  if (!riadky.length)
    text("Žiadna firma zatiaľ nie je napojená na eFaktúru.", OKRAJ, y, { c: SIVA });

  // Číslovanie strán.
  const strany = doc.getPages();
  strany.forEach((s, i) => {
    const t = `Strana ${i + 1} / ${strany.length}`;
    s.drawText(t, {
      x: STRANA[0] - OKRAJ - font.widthOfTextAtSize(t, 7.5),
      y: 18,
      size: 7.5,
      font,
      color: SIVA,
    });
  });
  return doc.save();
}
