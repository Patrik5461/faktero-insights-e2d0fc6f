import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import {
  EF_MAX_SPOLU,
  EF_MAX_SUBOR,
  EF_ODHAD_PDF,
  dovodNepovolenej,
  mimeEfaktury,
  obsahSediSMime,
  popisPdfFaktury,
  predvolenyVyber,
  skontrolujVyber,
  teloNaOdtlacok,
} from "./prilohy-efaktury";
import { odtlacokTela } from "./odtlacok.server";
import { teloOdoslania, type DokladNaOdoslanie } from "./epostak-telo";
import { mapToEN16931 } from "./en16931.server";
import { generatePeppolBisXml } from "./xml.server";
import { obsahPrilohy, prilohyZXml, prilozenePdf } from "./nahlad.server";

const MB = 1024 * 1024;
const p = (id: string, name: string, mime: string | null, size: number) => ({
  id,
  name,
  mime,
  size,
});

describe("výber príloh eFaktúry", () => {
  it("povolené MIME podľa BR-CL-22, aj podľa prípony", () => {
    expect(mimeEfaktury("application/pdf", "a.pdf")).toBe("application/pdf");
    expect(mimeEfaktury("", "tabulka.xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(mimeEfaktury("text/csv", "a.csv")).toBe("text/csv");
    expect(mimeEfaktury("image/jpeg", "f.jpg")).toBe("image/jpeg");
    // Faktero ich priložiť dovolí, Peppol nie.
    for (const [m, n] of [
      ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "a.docx"],
      ["application/zip", "a.zip"],
      ["image/webp", "a.webp"],
      ["image/heic", "a.heic"],
      ["text/plain", "a.txt"],
      ["application/xml", "a.xml"],
    ])
      expect(mimeEfaktury(m, n)).toBeNull();
  });

  it("nepovolený typ a súbor nad 10 MB majú dôvod", () => {
    expect(dovodNepovolenej(p("1", "zmluva.docx", "application/msword", 1000))).toMatch(/typ/);
    expect(dovodNepovolenej(p("2", "velky.pdf", "application/pdf", EF_MAX_SUBOR + 1))).toMatch(
      /10 MB/,
    );
    expect(dovodNepovolenej(p("3", "ok.pdf", "application/pdf", EF_MAX_SUBOR))).toBeNull();
  });

  it("PDF faktúry je prvé, prílohy v poradí výberu", () => {
    const v = skontrolujVyber(
      200_000,
      [p("a", "vykaz.xlsx", null, 1000), p("b", "foto.png", "image/png", 2000)],
      "FA1.pdf",
    );
    expect(v.poradie.map((x) => x.name)).toEqual(["FA1.pdf", "vykaz.xlsx", "foto.png"]);
    expect(v.poradie[0]!.druh).toBe("pdf");
    expect(v.spolu).toBe(203_000);
    expect(v.chyby).toEqual([]);
  });

  it("bez PDF len prílohy", () => {
    const v = skontrolujVyber(null, [p("a", "a.pdf", "application/pdf", 10)]);
    expect(v.poradie).toHaveLength(1);
    expect(v.poradie[0]!.druh).toBe("priloha");
  });

  it("súčet nad 15 MB a viac než 20 súborov neprejde", () => {
    const velke = [
      p("a", "a.pdf", "application/pdf", 8 * MB),
      p("b", "b.pdf", "application/pdf", 7 * MB),
    ];
    expect(skontrolujVyber(null, velke).chyby).toEqual([]);
    expect(skontrolujVyber(EF_ODHAD_PDF, velke).chyby.join(" ")).toMatch(/15 MB/);
    const vela = Array.from({ length: 20 }, (_, i) => p(String(i), `${i}.png`, "image/png", 10));
    expect(skontrolujVyber(null, vela).chyby).toEqual([]);
    expect(skontrolujVyber(1000, vela).chyby.join(" ")).toMatch(/20/);
  });

  it("nepovolený typ vo výbere zastaví odoslanie", () => {
    const v = skontrolujVyber(1000, [p("a", "a.zip", "application/zip", 10)]);
    expect(v.chyby[0]).toMatch(/^a\.zip: /);
  });

  it("predvolený výber: povolené, kým sa zmestia", () => {
    const zoznam = [
      p("doc", "zmluva.docx", "application/msword", 100),
      p("a", "a.pdf", "application/pdf", 9 * MB),
      p("b", "b.pdf", "application/pdf", 9 * MB), // s PDF by to bolo nad 15 MB
      p("c", "c.csv", "text/csv", 100),
    ];
    expect(predvolenyVyber(zoznam, true)).toEqual(["a", "c"]);
    expect(EF_ODHAD_PDF + 9 * MB + 100).toBeLessThanOrEqual(EF_MAX_SPOLU);
  });

  it("obsah sa overí podľa prvých bajtov", () => {
    expect(obsahSediSMime(Buffer.from("%PDF-1.7"), "application/pdf")).toBe(true);
    expect(obsahSediSMime(Buffer.from("PK\u0003\u0004xx"), "application/pdf")).toBe(false);
    expect(
      obsahSediSMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"),
    ).toBe(true);
    expect(obsahSediSMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBe(true);
    expect(
      obsahSediSMime(
        Buffer.from("PK\u0003\u0004"),
        "application/vnd.oasis.opendocument.spreadsheet",
      ),
    ).toBe(true);
    expect(obsahSediSMime(Buffer.from("a;b\n1;2\n"), "text/csv")).toBe(true);
    expect(obsahSediSMime(Buffer.from([0x61, 0x00, 0x62]), "text/csv")).toBe(false);
    expect(obsahSediSMime(new Uint8Array(), "application/pdf")).toBe(false);
  });

  it("popis PDF v jazyku dokladu", () => {
    expect(popisPdfFaktury("sk")).toBe("Faktúra v PDF");
    expect(popisPdfFaktury("de")).toBe("Rechnung als PDF");
    expect(popisPdfFaktury("xx")).toBe("Faktúra v PDF");
  });
});

const doklad: DokladNaOdoslanie = {
  druh: "invoice",
  cislo: "20260004",
  vystavena: "2026-10-05",
  splatnost: "2026-10-19",
  dodanie: "2026-10-04",
  mena: "EUR",
  vs: "20260004",
  iban: null,
  poznamka: null,
  buyerReference: "20260004",
  protistranaPeppolId: "0245:2022334455",
  protistranaNazov: "Odberateľ s.r.o.",
  polozky: [{ name: "Montáž", quantity: 1, unit_price: 25, vat_rate: 23 }],
};
const pdfB64 = Buffer.from("%PDF-1.4 faktura").toString("base64");

describe("telo a Idempotency-Key s prílohami", () => {
  it("attachments v tvare DocumentAttachment, PDF prvé", () => {
    const b = teloOdoslania({
      ...doklad,
      prilohy: [
        {
          fileName: "20260004.pdf",
          mimeType: "application/pdf",
          content: pdfB64,
          description: "Faktúra v PDF",
        },
        { fileName: "vykaz.csv", mimeType: "text/csv", content: "YQ==" },
      ],
    });
    expect(b.attachments).toEqual([
      {
        fileName: "20260004.pdf",
        mimeType: "application/pdf",
        content: pdfB64,
        description: "Faktúra v PDF",
      },
      { fileName: "vykaz.csv", mimeType: "text/csv", content: "YQ==" },
    ]);
    expect(teloOdoslania(doklad)).not.toHaveProperty("attachments");
  });

  it("bez príloh ostáva kľúč ako predtým", () => {
    const b = teloOdoslania(doklad);
    expect(odtlacokTela(b)).toBe(
      createHash("sha256").update(JSON.stringify(b)).digest("hex").slice(0, 16),
    );
  });

  it("odtlačok sa mení s obsahom aj výberom príloh, base64 v ňom nie je", () => {
    const a = { fileName: "a.pdf", mimeType: "application/pdf", content: pdfB64 };
    const s1 = teloOdoslania({ ...doklad, prilohy: [a] });
    const s1b = teloOdoslania({ ...doklad, prilohy: [{ ...a }] });
    const s2 = teloOdoslania({
      ...doklad,
      prilohy: [{ ...a, content: Buffer.from("%PDF-1.4 ine").toString("base64") }],
    });
    const s3 = teloOdoslania({
      ...doklad,
      prilohy: [a, { fileName: "b.csv", mimeType: "text/csv", content: "YQ==" }],
    });
    expect(odtlacokTela(s1)).toBe(odtlacokTela(s1b));
    expect(odtlacokTela(s1)).not.toBe(odtlacokTela(s2));
    expect(odtlacokTela(s1)).not.toBe(odtlacokTela(s3));
    expect(odtlacokTela(s1)).not.toBe(odtlacokTela(teloOdoslania(doklad)));
    const naHash = JSON.stringify(
      teloNaOdtlacok(s1, (x) => createHash("sha256").update(x).digest("hex")),
    );
    expect(naHash).not.toContain(pdfB64);
    expect(naHash).toContain("sha256:");
  });
});

xmlRegisterFsInputProviders();
function validator(cesta: string) {
  const url = new URL(cesta, import.meta.url);
  return XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
}
const UBL_INVOICE = validator("../schemy/ubl-2.1/maindoc/UBL-Invoice-2.1.xsd");
const UBL_CREDIT = validator("../schemy/ubl-2.1/maindoc/UBL-CreditNote-2.1.xsd");
function chybaXsd(v: XsdValidator, xml: string): string | null {
  const doc = XmlDocument.fromString(xml);
  try {
    v.validate(doc);
    return null;
  } catch (e) {
    return String((e as Error).message);
  } finally {
    doc.dispose();
  }
}

const firma: any = {
  name: "Dodávateľ s.r.o.",
  ico: "86179504",
  dic: "4286179504",
  ic_dph: "SK4286179504",
  street: "Hlavná 1",
  city: "Bratislava",
  zip: "81101",
  country: "SK",
  iban: "SK3112000000198742637541",
  vat_payer: true,
};
const faktura: any = {
  invoice_number: "FA2026123",
  type: "regular",
  issue_date: "2026-10-12",
  due_date: "2026-10-26",
  delivery_date: "2026-10-12",
  currency: "EUR",
  variable_symbol: "2026123",
  order_number: "OBJ-7",
  subtotal: 100,
  vat_total: 23,
  total: 123,
  customer_name: "Odberateľ a.s.",
  customer_ico: "43291067",
  customer_dic: "5843291067",
  customer_ic_dph: "SK5843291067",
  customer_country: "SK",
  customer_street: "Dlhá 5",
  customer_city: "Trnava",
  customer_zip: "91701",
};
const polozky: any[] = [
  {
    position: 1,
    name: "Montáž",
    quantity: 1,
    unit: "ks",
    unit_price: 100,
    vat_rate: 23,
    subtotal: 100,
    vat_amount: 23,
    total: 123,
  },
];
const prilohy = [
  {
    id: "FA2026123",
    popis: "Faktúra v PDF",
    mime: "application/pdf",
    nazov: "FA2026123.pdf",
    obsah: pdfB64,
  },
  { id: "2", mime: "text/csv", nazov: "vykaz.csv", obsah: Buffer.from("a;b\n").toString("base64") },
];

describe("UBL s prílohami (BG-24)", () => {
  it("faktúra: AdditionalDocumentReference za BillingReference/OrderReference, pred dodávateľom; XSD prejde", () => {
    const dto = mapToEN16931({ company: firma, invoice: faktura, items: polozky });
    const xml = generatePeppolBisXml({ ...dto, prilohy }).xml;
    expect(chybaXsd(UBL_INVOICE, xml)).toBeNull();
    const i = (s: string) => xml.indexOf(s);
    expect(i("<cac:AdditionalDocumentReference>")).toBeGreaterThan(i("<cac:OrderReference>"));
    expect(i("<cac:AdditionalDocumentReference>")).toBeLessThan(i("<cac:AccountingSupplierParty>"));
    expect(xml).toContain(
      `<cbc:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="FA2026123.pdf">${pdfB64}</cbc:EmbeddedDocumentBinaryObject>`,
    );
    expect(xml).toContain("<cbc:DocumentDescription>Faktúra v PDF</cbc:DocumentDescription>");
    expect(xml.match(/<cac:AdditionalDocumentReference>/g)).toHaveLength(2);
  });

  it("dobropis (CreditNote): poradie s BillingReference, XSD prejde", () => {
    const dobropis = {
      ...faktura,
      type: "credit_note",
      invoice_number: "D1",
      subtotal: -100,
      vat_total: -23,
      total: -123,
    };
    const riadky = [{ ...polozky[0], quantity: -1, subtotal: -100, vat_amount: -23, total: -123 }];
    const dto = mapToEN16931({
      company: firma,
      invoice: dobropis,
      items: riadky,
      povodnaFaktura: { cislo: "FA2026123", vystavena: "2026-10-12" },
    });
    const xml = generatePeppolBisXml({ ...dto, prilohy }).xml;
    expect(xml).toContain("<CreditNote");
    expect(chybaXsd(UBL_CREDIT, xml)).toBeNull();
    expect(xml.indexOf("<cac:AdditionalDocumentReference>")).toBeGreaterThan(
      xml.indexOf("</cac:BillingReference>"),
    );
  });

  it("bez príloh sa XML nemení", () => {
    const dto = mapToEN16931({ company: firma, invoice: faktura, items: polozky });
    expect(generatePeppolBisXml(dto).xml).not.toContain("AdditionalDocumentReference");
    expect(generatePeppolBisXml({ ...dto, prilohy: [] }).xml).toBe(generatePeppolBisXml(dto).xml);
  });
});

describe("prijatá eFaktúra s viacerými prílohami", () => {
  const vykazPdf = Buffer.from("%PDF-1.4 vykaz").toString("base64");
  const dto = mapToEN16931({ company: firma, invoice: faktura, items: polozky });
  const xml = generatePeppolBisXml({
    ...dto,
    prilohy: [
      {
        id: "1",
        popis: "Výkaz prác",
        mime: "application/pdf",
        nazov: "vykaz-praci.pdf",
        obsah: vykazPdf,
      },
      {
        id: "2",
        mime: "text/csv",
        nazov: "hodiny.csv",
        obsah: Buffer.from("a;b\n").toString("base64"),
      },
      {
        id: "3",
        popis: "Faktúra v PDF",
        mime: "application/pdf",
        nazov: "FA2026123.pdf",
        obsah: pdfB64,
      },
    ],
  }).xml;

  it("náhľad vezme PDF faktúry, nie prvé PDF", () => {
    expect(Buffer.from(prilozenePdf(xml)!).toString()).toBe("%PDF-1.4 faktura");
  });

  it("bez rozlíšenia ostáva prvé PDF", () => {
    const s = xml.replace("FA2026123.pdf", "scan.pdf").replace("Faktúra v PDF", "Sken");
    expect(Buffer.from(prilozenePdf(s)!).toString()).toBe("%PDF-1.4 vykaz");
  });

  it("zoznam príloh a stiahnutie jednej", () => {
    const zoznam = prilohyZXml(xml);
    expect(zoznam.map((x) => x.nazov)).toEqual(["vykaz-praci.pdf", "hodiny.csv", "FA2026123.pdf"]);
    expect(zoznam[0]).toMatchObject({
      index: 0,
      popis: "Výkaz prác",
      mime: "application/pdf",
      velkost: 14,
    });
    expect(Buffer.from(obsahPrilohy(xml, 1)!.bajty).toString()).toBe("a;b\n");
    expect(obsahPrilohy(xml, 9)).toBeNull();
  });
});
