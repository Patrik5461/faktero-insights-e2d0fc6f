/**
 * Nemecká e-faktúra: XRechnung (UBL) a ZUGFeRD / Factur-X (CII v PDF).
 *
 * Schémy v `schemy/ubl-2.1` (OASIS UBL 2.1 OS, len Invoice/CreditNote a
 * spoločné moduly, bez dokumentačných anotácií) a `schemy/cii-d16b`
 * (UN/CEFACT CII D16B, podmnožina pre EN 16931 z ConnectingEurope
 * eInvoicing-EN16931, „uncoupled clm“). Schematron (EN 16931 + KoSIT
 * XRechnung) sa tu nespúšťa — potrebuje XSLT 2.0; skúška cez SaxonJS je
 * popísaná v `~/qa-playwright/nastroje/xrechnung-schematron/over.mjs`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { XMLParser } from "fast-xml-parser";
import {
  generateXRechnung,
  referenciaOdberatela,
  XRECHNUNG_CUSTOMIZATION_ID,
} from "./xrechnung.server";
import { generateCiiXml, vlozFacturX, zugferdXml, FACTURX_SUBOR } from "./zugferd.server";
import { mapToEN16931De, EN16931_GUIDELINE_ID } from "./xrechnung.server";
import { dokladZXml } from "./doklad-xml";
import { dokladZPrilohy, prilohyPdf } from "./pdf-prilohy.server";
import { generateInvoicePdfBytes } from "./pdf-generator.server";
import { PDFDocument, PDFName, PDFArray, PDFDict } from "pdf-lib";

xmlRegisterFsInputProviders();

function validator(cesta: string) {
  const url = new URL(cesta, import.meta.url);
  return XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
}
const UBL_INVOICE = validator("./schemy/ubl-2.1/maindoc/UBL-Invoice-2.1.xsd");
const UBL_CREDIT = validator("./schemy/ubl-2.1/maindoc/UBL-CreditNote-2.1.xsd");
const CII = validator("./schemy/cii-d16b/CrossIndustryInvoice_100pD16B.xsd");

function platne(v: XsdValidator, xml: string): string | null {
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

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
});

const firma = {
  id: "c1",
  name: "Muster Software GmbH",
  country: "DE",
  street: "Hauptstraße 5",
  city: "München",
  zip: "80331",
  email: "rechnung@muster.de",
  phone: "+49 89 123456",
  dic: "143/123/45678",
  ic_dph: "DE123456789",
  iban: "DE89370400440532013000",
  swift: "COBADEFFXXX",
  vat_payer: true,
  vat_scheme: "de_regel",
  registergericht: "Amtsgericht München",
  handelsregister_nr: "HRB 123456",
  geschaeftsfuehrer: "Max Mustermann",
};

const faktura = {
  id: "f1",
  invoice_number: "RE-2026-0042",
  type: "regular",
  status: "issued",
  issue_date: "2026-10-15",
  delivery_date: "2026-10-14",
  due_date: "2026-10-29",
  currency: "EUR",
  variable_symbol: "2026042",
  payment_method: "bank_transfer",
  language: "de",
  subtotal: 1100,
  vat_total: 197,
  total: 1297,
  customer_name: "Kunde AG",
  customer_street: "Marktplatz 1",
  customer_city: "Berlin",
  customer_zip: "10115",
  customer_country: "DE",
  customer_ic_dph: "DE987654321",
  customer_email: "buchhaltung@kunde.de",
  order_number: "PO-7781",
};

const polozky = [
  {
    id: "i1",
    position: 1,
    name: "Softwareentwicklung",
    quantity: 10,
    unit: "h",
    unit_price: 100,
    vat_rate: 19,
    subtotal: 1000,
    vat_amount: 190,
    total: 1190,
  },
  {
    id: "i2",
    position: 2,
    name: "Fachbuch",
    quantity: 1,
    unit: "ks",
    unit_price: 100,
    vat_rate: 7,
    subtotal: 100,
    vat_amount: 7,
    total: 107,
  },
];

describe("XRechnung 3.0 (UBL)", () => {
  const r = generateXRechnung({ company: firma, invoice: faktura, items: polozky });
  const x = parser.parse(r.xml).Invoice;

  it("prejde XSD UBL 2.1 a nemá chyby BR-DE", () => {
    expect(platne(UBL_INVOICE, r.xml)).toBeNull();
    expect(r.validationErrors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("nesie identifikátor XRechnung 3.0 a Buyer reference z čísla objednávky", () => {
    expect(x.CustomizationID).toBe(XRECHNUNG_CUSTOMIZATION_ID);
    expect(x.BuyerReference).toBe("PO-7781");
    expect(x.OrderReference.ID).toBe("PO-7781");
  });

  it("predávajúci: e-mail ako EndpointID (EM), kontakt, USt-IdNr. aj Steuernummer (FC), HRB", () => {
    const p = x.AccountingSupplierParty.Party;
    expect(p.EndpointID["@schemeID"]).toBe("EM");
    expect(p.EndpointID["#text"]).toBe("rechnung@muster.de");
    expect(p.Contact).toEqual({
      Name: "Max Mustermann",
      Telephone: "+49 89 123456",
      ElectronicMail: "rechnung@muster.de",
    });
    const schemy = p.PartyTaxScheme.map((t: any) => [t.TaxScheme.ID, t.CompanyID]);
    expect(schemy).toEqual([
      ["VAT", "DE123456789"],
      ["FC", "143/123/45678"],
    ]);
    expect(p.PartyLegalEntity.CompanyID).toBe("HRB 123456");
    expect(p.PartyLegalEntity.CompanyLegalForm).toContain("Amtsgericht München");
  });

  it("platba SEPA 58 s IBAN-om, dátum dodania a rozpis 19 % + 7 %", () => {
    expect(x.PaymentMeans.PaymentMeansCode).toBe(58);
    expect(x.PaymentMeans.PayeeFinancialAccount.ID).toBe("DE89370400440532013000");
    expect(x.Delivery.ActualDeliveryDate).toBe("2026-10-14");
    const sadzby = x.TaxTotal.TaxSubtotal.map((t: any) => [
      t.TaxCategory.ID,
      t.TaxCategory.Percent,
    ]);
    expect(sadzby).toEqual([
      ["S", 7],
      ["S", 19],
    ]);
    expect(x.LegalMonetaryTotal.PayableAmount["#text"]).toBe(1297);
  });

  it("chýbajúci telefón a e-mail odberateľa zastavia XRechnung", () => {
    const zle = generateXRechnung({
      company: { ...firma, phone: "" },
      invoice: { ...faktura, customer_email: "" },
      items: polozky,
    });
    const kody = zle.validationErrors.map((c) => c.code);
    expect(kody).toContain("BR-DE-6");
    expect(kody).toContain("PEPPOL-EN16931-R010");
    expect(zle.valid).toBe(false);
  });

  it("zálohová faktúra a firma mimo Nemecka XRechnung nedostanú", () => {
    expect(() =>
      generateXRechnung({
        company: firma,
        invoice: { ...faktura, type: "proforma" },
        items: polozky,
      }),
    ).toThrow(/Zálohová/);
    expect(() =>
      generateXRechnung({ company: { ...firma, country: "SK" }, invoice: faktura, items: polozky }),
    ).toThrow(/Nemecku/);
  });

  it("Kleinunternehmer: kategória E so sadzbou 0 a dôvodom § 19 UStG", () => {
    const ku = { ...firma, vat_payer: false, vat_scheme: "de_kleinunternehmer", ic_dph: "" };
    const pol = polozky.map((p) => ({ ...p, vat_rate: 0, vat_amount: 0, total: p.subtotal }));
    const k = generateXRechnung({
      company: ku,
      invoice: { ...faktura, vat_total: 0, total: 1100 },
      items: pol,
    });
    expect(platne(UBL_INVOICE, k.xml)).toBeNull();
    expect(k.validationErrors).toEqual([]);
    const t = parser.parse(k.xml).Invoice.TaxTotal;
    expect(t.TaxSubtotal.TaxCategory.ID).toBe("E");
    expect(t.TaxSubtotal.TaxCategory.Percent).toBe(0);
    expect(t.TaxSubtotal.TaxCategory.TaxExemptionReason).toContain("§ 19 UStG");
  });

  it("§ 13b UStG = AE, dodanie tovaru do EÚ = K s adresou dodania, služba a trojstranný obchod = AE", () => {
    const pol0 = polozky.map((p) => ({ ...p, vat_amount: 0, total: p.subtotal }));
    const scen = (typ: string, eu?: string) =>
      generateXRechnung({
        company: firma,
        invoice: {
          ...faktura,
          reverse_charge: true,
          reverse_charge_type: typ,
          eu_plnenie: eu ?? null,
          customer_country: typ === "eu_b2b" ? "AT" : "DE",
          customer_ic_dph: typ === "eu_b2b" ? "ATU12345678" : "DE987654321",
          vat_total: 0,
          total: 1100,
        },
        items: pol0,
      });
    const kat = (r: ReturnType<typeof scen>) => {
      const t = parser.parse(r.xml).Invoice.TaxTotal.TaxSubtotal;
      return [t.TaxCategory.ID, t.TaxCategory.TaxExemptionReasonCode];
    };
    const tuz = scen("domestic_69");
    expect(kat(tuz)).toEqual(["AE", "VATEX-EU-AE"]);
    const tovar = scen("eu_b2b", "tovar");
    expect(kat(tovar)).toEqual(["K", "VATEX-EU-IC"]);
    expect(
      parser.parse(tovar.xml).Invoice.Delivery.DeliveryLocation.Address.Country.IdentificationCode,
    ).toBe("AT");
    expect(kat(scen("eu_b2b", "sluzba"))).toEqual(["AE", "VATEX-EU-AE"]);
    const troj = scen("eu_b2b", "trojstranny");
    expect(kat(troj)).toEqual(["AE", "VATEX-EU-AE"]);
    expect(troj.xml).toContain("§ 25b UStG");
    expect(kat(scen("export"))).toEqual(["G", "VATEX-EU-G"]);
    for (const r of [tuz, tovar, troj]) {
      expect(platne(UBL_INVOICE, r.xml)).toBeNull();
      expect(r.validationErrors).toEqual([]);
    }
  });

  it("dobropis je CreditNote s kladnými sumami a odkazom na pôvodnú faktúru", () => {
    const d = generateXRechnung({
      company: firma,
      invoice: { ...faktura, type: "credit_note", subtotal: -1100, vat_total: -197, total: -1297 },
      items: polozky.map((p) => ({
        ...p,
        quantity: -p.quantity,
        subtotal: -p.subtotal,
        vat_amount: -p.vat_amount,
        total: -p.total,
      })),
      povodnaFaktura: { cislo: "RE-2026-0040", vystavena: "2026-10-01" },
    });
    expect(platne(UBL_CREDIT, d.xml)).toBeNull();
    expect(d.validationErrors).toEqual([]);
    const c = parser.parse(d.xml).CreditNote;
    expect(c.CreditNoteTypeCode).toBe(381);
    expect(c.BillingReference.InvoiceDocumentReference.ID).toBe("RE-2026-0040");
    expect(c.LegalMonetaryTotal.PayableAmount["#text"]).toBe(1297);
  });

  it("ťarchopis ide ako opravná faktúra 384 (BR-DE-17)", () => {
    const t = generateXRechnung({
      company: firma,
      invoice: { ...faktura, type: "debit_note" },
      items: polozky,
      povodnaFaktura: { cislo: "RE-2026-0040", vystavena: "2026-10-01" },
    });
    expect(parser.parse(t.xml).Invoice.InvoiceTypeCode).toBe(384);
    expect(t.validationErrors).toEqual([]);
  });

  it("zaokrúhlenie sumy na úhradu ide do PayableRoundingAmount", () => {
    const z = generateXRechnung({
      company: firma,
      invoice: { ...faktura, payment_method: "cash", total: 1297.05 },
      items: polozky,
    });
    const t = parser.parse(z.xml).Invoice.LegalMonetaryTotal;
    expect(t.PayableRoundingAmount["#text"]).toBe(0.05);
    expect(t.PayableAmount["#text"]).toBe(1297.05);
    expect(parser.parse(z.xml).Invoice.PaymentMeans.PaymentMeansCode).toBe(10);
    expect(z.validationErrors).toEqual([]);
  });
});

describe("Buyer reference (BT-10)", () => {
  it("Leitweg-ID z karty, potom 0204 Peppol id, potom objednávka, nakoniec n/a", () => {
    expect(referenciaOdberatela({ invoice: {}, customer: { leitweg_id: "991-12345-67" } })).toEqual(
      {
        hodnota: "991-12345-67",
        leitweg: true,
      },
    );
    expect(
      referenciaOdberatela({ invoice: {}, customer: { peppol_id: "0204:04011000-1234512345-06" } })
        .hodnota,
    ).toBe("04011000-1234512345-06");
    expect(referenciaOdberatela({ invoice: { order_number: "PO-1" } }).hodnota).toBe("PO-1");
    expect(referenciaOdberatela({ invoice: {} }).hodnota).toBe("n/a");
  });
});

describe("ZUGFeRD / Factur-X (CII)", () => {
  const { xml, chyby } = zugferdXml({ company: firma, invoice: faktura, items: polozky });

  it("CII prejde XSD D16B a nesie profil EN 16931", () => {
    expect(chyby).toEqual([]);
    expect(platne(CII, xml)).toBeNull();
    expect(xml).toContain(`<ram:ID>${EN16931_GUIDELINE_ID}</ram:ID>`);
  });

  it("čítač dokladov prečíta CII späť so správnymi sumami (round-trip)", () => {
    const d = dokladZXml(xml)!;
    expect(d.zdroj_udajov).toBe("zugferd");
    expect(d.invoice_number).toBe("RE-2026-0042");
    expect(d.issue_date).toBe("2026-10-15");
    expect(d.delivery_date).toBe("2026-10-14");
    expect(d.due_date).toBe("2026-10-29");
    expect(d.amount_without_vat).toBe(1100);
    expect(d.vat_amount).toBe(197);
    expect(d.amount_total).toBe(1297);
    expect(d.supplier_name).toBe("Muster Software GmbH");
    expect(d.supplier_ic_dph).toBe("DE123456789");
    expect(d.supplier_iban).toBe("DE89370400440532013000");
    expect(d.order_number).toBe("PO-7781");
    expect(d.items).toEqual([
      expect.objectContaining({
        name: "Softwareentwicklung",
        quantity: 10,
        unit_price: 100,
        vat_rate: 19,
        total: 1190,
      }),
      expect.objectContaining({
        name: "Fachbuch",
        quantity: 1,
        unit_price: 100,
        vat_rate: 7,
        total: 107,
      }),
    ]);
  });

  it("dobropis a Kleinunternehmer v CII prejdú XSD", () => {
    const dto = mapToEN16931De(
      {
        company: firma,
        invoice: {
          ...faktura,
          type: "credit_note",
          subtotal: -1100,
          vat_total: -197,
          total: -1297,
        },
        items: polozky.map((p) => ({
          ...p,
          subtotal: -p.subtotal,
          vat_amount: -p.vat_amount,
          total: -p.total,
        })),
        povodnaFaktura: { cislo: "RE-2026-0040", vystavena: "2026-10-01" },
      },
      { customizationId: EN16931_GUIDELINE_ID },
    );
    const cii = generateCiiXml(dto);
    expect(platne(CII, cii)).toBeNull();
    expect(dokladZXml(cii)!.document_subtype).toBe("dobropis");

    const ku = zugferdXml({
      company: { ...firma, vat_payer: false, vat_scheme: "de_kleinunternehmer" },
      invoice: { ...faktura, vat_total: 0, total: 1100 },
      items: polozky.map((p) => ({ ...p, vat_rate: 0, vat_amount: 0, total: p.subtotal })),
    });
    expect(ku.chyby).toEqual([]);
    expect(platne(CII, ku.xml)).toBeNull();
    expect(dokladZXml(ku.xml)!.vat_amount).toBe(0);
  });

  it("PDF faktúry s vloženým factur-x.xml: príloha v EmbeddedFiles aj AF, XMP Factur-X, čítač ju nájde", async () => {
    const pdf = await generateInvoicePdfBytes({
      company: firma,
      invoice: faktura,
      items: polozky,
    } as any);
    const s = await vlozFacturX(pdf, xml, { cislo: faktura.invoice_number, firma: firma.name });

    const prilohy = await prilohyPdf(s);
    expect(prilohy.map((p) => p.nazov)).toEqual([FACTURX_SUBOR]);
    expect(new TextDecoder().decode(prilohy[0].data)).toBe(xml);

    const d = await dokladZPrilohy(s, "application/pdf");
    expect(d?.zdroj_udajov).toBe("zugferd");
    expect(d?.amount_total).toBe(1297);

    const doc = await PDFDocument.load(s);
    const af = doc.catalog.lookup(PDFName.of("AF"), PDFArray);
    const spec = af.lookup(0, PDFDict);
    expect(String(spec.get(PDFName.of("AFRelationship")))).toBe("/Alternative");
    expect(doc.catalog.has(PDFName.of("OutputIntents"))).toBe(true);
    const meta = new TextDecoder().decode(
      (doc.catalog.lookup(PDFName.of("Metadata")) as any).getContents(),
    );
    expect(meta).toContain("<pdfaid:part>3</pdfaid:part>");
    expect(meta).toContain("<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>");
    expect(meta).toContain("<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>");
    expect(doc.getTitle()).toBe("Rechnung RE-2026-0042");
  });
});
