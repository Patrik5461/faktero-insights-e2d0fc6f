import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { dokumentZoSablonyPdf, vykazDochadzkyPdf } from "./zamestnanci-pdf.server";
import { hodnotyTokenov, PREDVOLENE_SABLONY, vyplnSablonu } from "./zamestnanci";

describe("PDF modulu Zamestnanci", () => {
  it("pracovná zmluva zo šablóny je platné PDF s diakritikou", async () => {
    const text = vyplnSablonu(
      PREDVOLENE_SABLONY.pracovna_zmluva,
      hodnotyTokenov({
        firma: { name: "Tobify s. r. o.", ico: "56607016", city: "Bratislava" },
        zamestnanec: { id: "z", first_name: "Ľubomír", last_name: "Šťastný", status: "active" },
        zmluva: null,
        dnes: "2026-09-21",
      }),
    );
    const bajty = await dokumentZoSablonyPdf(text, "Tobify s. r. o. · Pracovná zmluva · Ľubomír Šťastný");
    expect(new TextDecoder().decode(bajty.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bajty);
    expect(doc.getPageCount()).toBe(1);
  });

  it("dlhý text sa zalomí na ďalšie strany", async () => {
    const dlhy = Array.from({ length: 200 }, (_, i) => `${i + 1}. Odsek so slovami, ktoré sa musia zalomiť do šírky strany, aby nič nepretieklo za okraj.`).join("\n");
    const doc = await PDFDocument.load(await dokumentZoSablonyPdf(`# NADPIS\n${dlhy}`, "skúška"));
    expect(doc.getPageCount()).toBeGreaterThan(2);
  });

  it("mesačný výkaz dochádzky vznikne aj prázdny", async () => {
    const plny = await vykazDochadzkyPdf({
      firma: "Tobify s. r. o.",
      mesiac: "2026-10",
      suhrn: [
        {
          employee_id: "z",
          meno: "Ján Novák",
          odpracovaneDni: 20,
          hodiny: 160,
          nepritomnosti: { dovolenka: 2, pn: 0, ocr: 0, nahradne_volno: 0, neplatene_volno: 0, sviatok: 1, ine: 0 },
        },
      ],
    });
    const prazdny = await vykazDochadzkyPdf({ firma: "Tobify s. r. o.", mesiac: "2026-10", suhrn: [] });
    for (const b of [plny, prazdny]) expect((await PDFDocument.load(b)).getPageCount()).toBe(1);
  });
});
