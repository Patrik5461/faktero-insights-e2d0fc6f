import { describe, it, expect } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { buildPohodaInvoiceXml, EXPORT_STRATEGIES } from "./export.server";

const firma = { ico: "12345678", iban: "SK1234567890123456789012" };

const faktura = {
  invoice_number: "20250001",
  variable_symbol: "20250001",
  type: "regular",
  issue_date: "2025-03-04",
  delivery_date: "2025-03-02",
  due_date: "2025-03-18",
  notes: "Za marec",
  customer_name: "ACME s.r.o.",
  customer_street: "Hlavná 1",
  customer_city: "Trnava",
  customer_zip: "91701",
  customer_country: "SK",
  customer_ico: "00151653",
  customer_dic: "2020304050",
  customer_ic_dph: "SK2020304050",
  customer_email: "fakturacia@acme.sk",
};

// Sadzby zámerne rôzne — Pohoda ich triedi do štyroch košov.
const polozky = [
  { name: "Montážne práce", quantity: 10, unit: "h", unit_price: 10, vat_rate: 23, subtotal: 100, vat_amount: 23, total: 123 },
  { name: "Kniha", quantity: 1, unit: "ks", unit_price: 50, vat_rate: 19, subtotal: 50, vat_amount: 9.5, total: 59.5 },
  { name: "Liek", quantity: 2, unit: "ks", unit_price: 10, vat_rate: 5, subtotal: 20, vat_amount: 1, total: 21 },
  { name: "Poštovné", quantity: 1, unit: "ks", unit_price: 5, vat_rate: 0, subtotal: 5, vat_amount: 0, total: 5 },
];

const xml = buildPohodaInvoiceXml({ company: firma, invoices: [{ invoice: faktura, items: polozky }] });
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true });
const doc = parser.parse(xml);
const hlavicka = doc.dataPack.dataPackItem.invoice.invoiceHeader;
const suhrn = doc.dataPack.dataPackItem.invoice.invoiceSummary.homeCurrency;

describe("Pohoda XML export", () => {
  it("je platné XML", () => {
    expect(XMLValidator.validate(xml)).toBe(true);
  });

  it("hlavička nesie číslo, symboly a dátumy", () => {
    expect(hlavicka.number.numberRequested).toBe(20250001);
    expect(String(hlavicka.symVar)).toBe("20250001");
    expect(hlavicka.date).toBe("2025-03-04");
    // Dátum zdaniteľného plnenia je dátum dodania, nie vystavenia.
    expect(hlavicka.dateTax).toBe("2025-03-02");
    expect(hlavicka.dateDue).toBe("2025-03-18");
    expect(hlavicka.invoiceType).toBe("issuedInvoice");
  });

  it("nesie odberateľa vrátane IČ DPH", () => {
    const a = hlavicka.partnerIdentity.address;
    expect(a.company).toBe("ACME s.r.o.");
    expect(a.city).toBe("Trnava");
    expect(a.icDph).toBe("SK2020304050");
    expect(a.country.ids).toBe("SK");
  });

  it("položky sú všetky a v správnych sadzbách", () => {
    const p = doc.dataPack.dataPackItem.invoice.invoiceDetail.invoiceItem;
    expect(p).toHaveLength(4);
    expect(p.map((x: any) => x.rateVAT)).toEqual(["high", "low", "third", "none"]);
    expect(p[0].text).toBe("Montážne práce");
    expect(Number(p[0].homeCurrency.priceSum)).toBe(123);
  });

  // Súčty v pätičke musia sedieť s položkami, inak Pohoda doklad odmietne.
  it("súčty po sadzbách sedia s položkami", () => {
    expect(Number(suhrn.priceHigh)).toBe(100);
    expect(Number(suhrn.priceHighVAT)).toBe(23);
    expect(Number(suhrn.priceLow)).toBe(50);
    expect(Number(suhrn.priceLowVAT)).toBe(9.5);
    expect(Number(suhrn.priceThird)).toBe(20);
    expect(Number(suhrn.priceThirdVAT)).toBe(1);
    expect(Number(suhrn.priceNone)).toBe(5);

    const zaklad = polozky.reduce((s, p) => s + p.subtotal, 0);
    const dan = polozky.reduce((s, p) => s + p.vat_amount, 0);
    expect(
      Number(suhrn.priceHigh) + Number(suhrn.priceLow) + Number(suhrn.priceThird) + Number(suhrn.priceNone),
    ).toBe(zaklad);
    expect(
      Number(suhrn.priceHighVAT) + Number(suhrn.priceLowVAT) + Number(suhrn.priceThirdVAT),
    ).toBe(dan);
  });

  it("dobropis sa označí ako dobropis", () => {
    const d = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: { ...faktura, type: "credit_note" }, items: polozky }],
    });
    expect(parser.parse(d).dataPack.dataPackItem.invoice.invoiceHeader.invoiceType).toBe(
      "issuedCreditNotice",
    );
  });

  // Meno firmy s ampersandom alebo lomenou zátvorkou by inak XML rozbilo.
  it("znaky z názvu firmy sa ošetria", () => {
    const d = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: { ...faktura, customer_name: 'Kováč & Syn <s.r.o.>' }, items: polozky }],
    });
    expect(XMLValidator.validate(d)).toBe(true);
    expect(parser.parse(d).dataPack.dataPackItem.invoice.invoiceHeader.partnerIdentity.address.company).toBe(
      "Kováč & Syn <s.r.o.>",
    );
  });

  it("viac faktúr dá viac položiek dátového balíka", () => {
    const d = buildPohodaInvoiceXml({
      company: firma,
      invoices: [
        { invoice: faktura, items: polozky },
        { invoice: { ...faktura, invoice_number: "20250002" }, items: polozky },
      ],
    });
    expect(parser.parse(d).dataPack.dataPackItem).toHaveLength(2);
  });

  it("stratégia vráti súbor s príponou a typom", () => {
    const r = EXPORT_STRATEGIES.pohoda_xml.build({
      company: firma,
      invoices: [{ invoice: faktura, items: polozky }],
    });
    expect(r.fileName).toMatch(/^pohoda-faktury-\d{4}-\d{2}-\d{2}\.xml$/);
    expect(r.mime).toBe("application/xml");
    expect(XMLValidator.validate(r.content)).toBe(true);
  });
});
