import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { XMLParser } from "fast-xml-parser";
import { buildIsdoc, uuidDokladu } from "./isdoc-export";
import { jeIsdoc, isdocNaRiadky } from "./isdoc";

const firma = {
  name: "Testovací s.r.o.",
  ico: "25097563",
  dic: "CZ25097563",
  ic_dph: "CZ25097563",
  street: "Dlouhá 12",
  city: "Praha",
  zip: "11000",
  country: "CZ",
  iban: "CZ12 3456 7890 1234 5678 90",
  swift: "GIBACZPX",
  default_currency: "CZK",
};

const faktura = {
  id: "3f2a5c10-1b2c-4d3e-8f90-1234567890ab",
  invoice_number: "2026001",
  type: "regular",
  issue_date: "2026-03-04",
  delivery_date: "2026-03-04",
  due_date: "2026-03-18",
  currency: "CZK",
  variable_symbol: "2026001",
  customer_name: "Odběratel a.s.",
  customer_ico: "12345678",
  customer_ic_dph: "CZ12345678",
  customer_street: "Krátká 1",
  customer_city: "Brno",
  customer_zip: "60200",
  customer_country: "CZ",
};

/** Dve sadzby a nulová — rekapitulácia musí mať tri riadky. */
const polozky = [
  {
    name: "Práce",
    quantity: 10,
    unit: "h",
    unit_price: 100,
    vat_rate: 21,
    subtotal: 1000,
    vat_amount: 210,
  },
  {
    name: "Kniha",
    quantity: 2,
    unit: "ks",
    unit_price: 250,
    vat_rate: 12,
    subtotal: 500,
    vat_amount: 60,
  },
  {
    name: "Poštovné",
    quantity: 1,
    unit: "ks",
    unit_price: 90,
    vat_rate: 0,
    subtotal: 90,
    vat_amount: 0,
  },
];

const XML = buildIsdoc({ invoice: faktura, items: polozky, company: firma });

const validator = (() => {
  const xsd = XmlDocument.fromBuffer(
    readFileSync(new URL("./schemy/isdoc-invoice-6.0.2.xsd", import.meta.url)),
  );
  return XsdValidator.fromDoc(xsd);
})();

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
});

describe("ISDOC vývoz", () => {
  /*
    Toto je jediný test, ktorý naozaj rozhoduje. Doklad ide štátu a podateľňa
    ho odmietne bez vysvetlenia — schéma musí sedieť do bodky, nie „približne".
  */
  it("prejde oficiálnou schémou ISDOC 6.0.2", () => {
    const doc = XmlDocument.fromString(XML);
    expect(() => validator.validate(doc)).not.toThrow();
    doc.dispose();
  });

  it("dobropis prejde schémou tiež", () => {
    const cn = buildIsdoc({
      invoice: { ...faktura, type: "credit_note" },
      items: polozky,
      company: firma,
    });
    const doc = XmlDocument.fromString(cn);
    expect(() => validator.validate(doc)).not.toThrow();
    doc.dispose();
    expect(cn).toContain("<DocumentType>2</DocumentType>");
    // Dobropis znižuje — sumy musia ísť záporne, inak by zvyšoval základ dane.
    expect(cn).toContain("<TaxExclusiveAmount>-1590.00</TaxExclusiveAmount>");
  });

  it("súčty sedia na položky", () => {
    expect(XML).toContain("<TaxExclusiveAmount>1590.00</TaxExclusiveAmount>");
    expect(XML).toContain("<TaxInclusiveAmount>1860.00</TaxInclusiveAmount>");
    expect(XML).toContain("<PayableAmount>1860.00</PayableAmount>");
    expect(XML).toContain("<TaxAmount>270.00</TaxAmount>");
  });

  it("rekapitulácia má riadok na každú sadzbu vrátane nulovej", () => {
    const d = parser.parse(XML);
    const sub = d.Invoice.TaxTotal.TaxSubTotal;
    expect(sub).toHaveLength(3);
    expect(sub.map((s: any) => s.TaxCategory.Percent)).toEqual(["21.00", "12.00", "0.00"]);
  });

  /*
    UUID identifikuje doklad naprieč systémami. Keby sa menilo pri každom
    vývoze, ten istý doklad by prišiel príjemcovi zakaždým ako nový.
  */
  it("UUID je pre ten istý doklad stále rovnaké", () => {
    expect(uuidDokladu(faktura)).toBe(uuidDokladu(faktura));
    expect(uuidDokladu(faktura)).toBe("3F2A5C10-1B2C-4D3E-8F90-1234567890AB");
    const bezId = { invoice_number: "2026002", issue_date: "2026-03-04" };
    expect(uuidDokladu(bezId)).toBe(uuidDokladu(bezId));
    expect(uuidDokladu(bezId)).not.toBe(uuidDokladu(faktura));
  });

  /* Čo vyvezieme, musíme vedieť aj prečítať — inak sa to nedá ani preveriť. */
  it("vlastný ISDOC prečíta náš vlastný čítač", () => {
    expect(jeIsdoc(XML)).toBe(true);
    const riadky = isdocNaRiadky(parser.parse(XML));
    expect(riadky).toHaveLength(3);
    expect(riadky[0].invoice_number).toBe("2026001");
    expect(riadky[0].customer_name).toBe("Odběratel a.s.");
  });

  it("znaky, ktoré by rozbili XML, sú ošetrené", () => {
    const x = buildIsdoc({
      invoice: faktura,
      items: [{ ...polozky[0], name: 'Práce <a> & "b"' }],
      company: firma,
    });
    expect(x).toContain("Práce &lt;a&gt; &amp; &quot;b&quot;");
    const doc = XmlDocument.fromString(x);
    expect(() => validator.validate(doc)).not.toThrow();
    doc.dispose();
  });
});
