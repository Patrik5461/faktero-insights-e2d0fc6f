import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

/*
  Balík so všetkými dátami firmy nad podvrhnutou databázou — overuje, že sú
  v ňom všetky agendy, prílohy aj súbory ostatných dokladov, že sa súbory
  s rovnakým menom neprepíšu a že tabuľka bez prístupu balík nezhodí.
*/
const FIRMA = "11111111-1111-1111-1111-111111111111";

const DATA: Record<string, Record<string, unknown>[]> = {
  companies: [{ id: FIRMA, name: "Skúšobná s.r.o." }],
  invoices: [{ id: "f1", company_id: FIRMA, invoice_number: "2026001" }],
  invoice_items: [{ id: "fi1", invoice_id: "f1", name: "Služba" }],
  purchase_invoices: [
    {
      id: "p1",
      company_id: FIRMA,
      invoice_number: "D-1",
      supplier_name: "Dodo",
      issue_date: "2026-10-01",
      file_path: `${FIRMA}/a.pdf`,
    },
    {
      id: "p2",
      company_id: FIRMA,
      invoice_number: "D-1",
      supplier_name: "Dodo",
      issue_date: "2026-10-01",
      file_path: `${FIRMA}/b.pdf`,
    },
  ],
  other_documents: [
    {
      id: "o1",
      company_id: FIRMA,
      sender: "Daňový úrad",
      subject: "Výzva",
      received_date: "2026-10-02",
    },
  ],
  other_document_files: [
    {
      id: "of1",
      company_id: FIRMA,
      document_id: "o1",
      path: `${FIRMA}/o1/vyzva.pdf`,
      name: "vyzva.pdf",
    },
  ],
  invoice_attachments: [
    {
      id: "ia1",
      company_id: FIRMA,
      invoice_id: "f1",
      path: `${FIRMA}/f1/vykaz.xlsx`,
      name: "vykaz.xlsx",
    },
  ],
  prilohy_dokladov: [
    {
      id: "pd1",
      company_id: FIRMA,
      purchase_invoice_id: "p1",
      path: `${FIRMA}/p1/zmluva.pdf`,
      name: "zmluva.pdf",
    },
  ],
  payments: [{ id: "u1", company_id: FIRMA, invoice_id: "f1", amount: 123 }],
  quotes: [{ id: "q1", company_id: FIRMA, quote_number: "CP1" }],
  quote_items: [{ id: "qi1", quote_id: "q1", name: "Ponuka" }],
  // Tabuľka s právami po stĺpcoch (alebo bez modulu) vráti chybu.
  vyuctovania_vydavkov: "CHYBA" as never,
};

function dotaz(tabulka: string): any {
  const riadky = DATA[tabulka];
  const q: any = {
    select: () => q,
    eq: () => q,
    in: () => q,
    gte: () => q,
    lte: () => q,
    lt: () => q,
    order: () => q,
    maybeSingle: async () => ({ data: (riadky as any)?.[0] ?? null }),
    range: async () =>
      (riadky as unknown) === "CHYBA"
        ? { data: null, error: { message: "permission denied" } }
        : { data: riadky ?? [], error: null },
  };
  return q;
}

const stiahnute: string[] = [];
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    storage: {
      from: (kos: string) => ({
        download: async (cesta: string) => {
          stiahnute.push(`${kos}:${cesta}`);
          return { data: new Blob([`obsah ${cesta}`]) };
        },
      }),
    },
  },
}));

describe("zostavBalikFirmy", () => {
  it("všetky agendy, prílohy a súbory ostatných dokladov", async () => {
    const { zostavBalikFirmy } = await import("./export-firmy.server");
    const b = await zostavBalikFirmy(
      { from: dotaz },
      { company_id: FIRMA, s_pdf: false, s_skenmi: true, podla: "vystavenia" },
      { maxPdf: 10, maxSkenov: 10 },
    );
    const zip = await JSZip.loadAsync(b.obsah);
    const subory = Object.keys(zip.files).filter((f) => !f.endsWith("/"));
    expect(subory).toEqual(
      expect.arrayContaining([
        "faktury.csv",
        "faktury-polozky.csv",
        "prijate-faktury.csv",
        "uhrady-faktur.csv",
        "ponuky.csv",
        "ponuky-polozky.csv",
        "prilohy-faktur.csv",
        "prilohy-dokladov.csv",
        "ostatne-doklady-subory.csv",
        // Dva skeny s rovnakým dátumom, dodávateľom a číslom — oba ostanú.
        "skeny/prijate-faktury/2026-10-01_Dodo_D-1.pdf",
        "skeny/prijate-faktury/2026-10-01_Dodo_D-1-2.pdf",
        "skeny/ostatne-doklady/2026-10-02_Danovy-urad_Vyzva_vyzva.pdf",
        "prilohy/faktury/2026001_vykaz.xlsx",
        "prilohy/doklady/D-1_zmluva.pdf",
      ]),
    );
    expect(b.skenov).toBe(5);
    expect(stiahnute).toContain(`other-docs:${FIRMA}/o1/vyzva.pdf`);
    expect(stiahnute).toContain(`invoice-attachments:${FIRMA}/f1/vykaz.xlsx`);
    // Tabuľka bez prístupu sa preskočí a v OBSAH.txt je to napísané.
    expect(await zip.file("OBSAH.txt")!.async("string")).toContain("vyuctovania_vydavkov");
  });
});
