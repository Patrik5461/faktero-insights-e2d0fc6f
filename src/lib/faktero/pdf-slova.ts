/*
  Slová textovej vrstvy jednej strany PDF (pdf.js) s polohou v zlomkoch strany.
  Používa ich výber hodnoty kliknutím (NahladSVyberom) aj zvýraznenie
  vyťažených údajov (NahladPdf). Beží len v prehliadači — `pdfjs` je
  načítaný modul `pdfjs-dist`, `meradlo` kontext plátna na meranie šírky slov.
*/
import { slovaZUseku, type SlovoNahladu } from "./vyber-z-dokladu";

export async function slovaStranyPdf(
  pdfjs: any,
  strana: any,
  viewport: any,
  meradlo: CanvasRenderingContext2D | null,
): Promise<SlovoNahladu[]> {
  const slova: SlovoNahladu[] = [];
  try {
    const obsah = await strana.getTextContent();
    for (const p of obsah.items as any[]) {
      if (!p?.str?.trim()) continue;
      const styl = (obsah.styles as any)?.[p.fontName] ?? {};
      if (styl.vertical) continue;
      const tx = pdfjs.Util.transform(viewport.transform, p.transform);
      // Otočený text sa do rámčekov nedá vložiť rozumne — vynechá sa.
      if (Math.abs(tx[1]) > 0.01 * Math.abs(tx[0])) continue;
      const vyska = Math.hypot(tx[2], tx[3]);
      const sirka = p.width * viewport.scale;
      if (!(vyska > 0 && sirka > 0)) continue;
      const vystup = typeof styl.ascent === "number" && styl.ascent > 0 ? styl.ascent : 0.8;
      const hore = tx[5] - vyska * vystup;
      if (meradlo) meradlo.font = `${vyska}px ${styl.fontFamily ?? "sans-serif"}`;
      slova.push(
        ...slovaZUseku(
          {
            str: p.str,
            x: tx[4] / viewport.width,
            y: hore / viewport.height,
            w: sirka / viewport.width,
            h: (vyska * 1.15) / viewport.height,
          },
          (s) => (meradlo ? meradlo.measureText(s).width : s.length),
        ),
      );
    }
  } catch (e) {
    console.warn("[nahlad] text strany sa nepodarilo prečítať:", e);
  }
  return slova;
}
