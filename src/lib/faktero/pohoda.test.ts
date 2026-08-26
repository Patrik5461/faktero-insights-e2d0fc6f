import { describe, it, expect } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { buildPohodaInvoiceXml } from "./export.server";
import { parseVendorFile, summarize } from "./import-vendors.server";
import { jeMPohodaJson, jePohodaXml, mpohodaNaRiadky, pohodaNaRiadky } from "./pohoda";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  parseTagValue: false,
});

const faktura = {
  invoice_number: "20250001",
  variable_symbol: "20250001",
  type: "regular",
  issue_date: "2025-03-04",
  delivery_date: "2025-03-02",
  due_date: "2025-03-18",
  notes: "Za marec",
  total: 208.5,
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

const polozky = [
  {
    name: "Montážne práce",
    quantity: 10,
    unit: "h",
    unit_price: 10,
    vat_rate: 23,
    subtotal: 100,
    vat_amount: 23,
    total: 123,
  },
  {
    name: "Kniha",
    quantity: 1,
    unit: "ks",
    unit_price: 50,
    vat_rate: 19,
    subtotal: 50,
    vat_amount: 9.5,
    total: 59.5,
  },
  {
    name: "Liek",
    quantity: 2,
    unit: "ks",
    unit_price: 10,
    vat_rate: 5,
    subtotal: 20,
    vat_amount: 1,
    total: 21,
  },
  {
    name: "Poštovné",
    quantity: 1,
    unit: "ks",
    unit_price: 5,
    vat_rate: 0,
    subtotal: 5,
    vat_amount: 0,
    total: 5,
  },
];

/** Dokladový balík v tvare, aký vyrába aj samotná Pohoda. */
const XML = buildPohodaInvoiceXml({
  company: { ico: "56607016" },
  invoices: [{ invoice: faktura, items: polozky }],
});

/** Export z Pohody má koreň `responsePack`, nie `dataPack`. */
const XML_RESPONSE = XML.replace(/dataPack/g, "responsePack");

const bajty = (s: string) => new TextEncoder().encode(s);

describe("Pohoda XML", () => {
  it("rozpozná dokladový balík", () => {
    expect(jePohodaXml(XML)).toBe(true);
    expect(jePohodaXml(XML_RESPONSE)).toBe(true);
    expect(jePohodaXml("<Invoices><Invoice/></Invoices>")).toBe(false);
  });

  const riadky = pohodaNaRiadky(parser.parse(XML));

  it("jeden riadok na položku, hlavička sa opakuje", () => {
    expect(riadky).toHaveLength(4);
    expect(new Set(riadky.map((r) => r.invoice_number))).toEqual(new Set(["20250001"]));
  });

  it("prečíta hlavičku dokladu", () => {
    expect(riadky[0]).toMatchObject({
      invoice_number: "20250001",
      variable_symbol: "20250001",
      issue_date: "2025-03-04",
      // `dateTax` je dátum zdaniteľného plnenia — u nás dátum dodania.
      delivery_date: "2025-03-02",
      due_date: "2025-03-18",
      notes: "Za marec",
      document_type: "regular",
    });
  });

  it("prečíta odberateľa vrátane IČ DPH", () => {
    expect(riadky[0]).toMatchObject({
      customer_name: "ACME s.r.o.",
      customer_ico: "00151653",
      customer_ic_dph: "SK2020304050",
      customer_city: "Trnava",
      customer_zip: "91701",
      customer_country: "SK",
      customer_email: "fakturacia@acme.sk",
    });
  });

  // Súčty sú v pätičke rozpísané po sadzbách; celková suma je ich súčet.
  it("dopočíta základ, DPH a celkom zo súhrnu", () => {
    expect(riadky[0].subtotal).toBe("175");
    expect(riadky[0].vat_total).toBe("33.5");
    expect(riadky[0].total).toBe("208.5");
  });

  /*
   * Kód `rateVAT` hovorí len o priehradke (none/low/high/third), nie o
   * percente — a percentá sa v čase menili. Sadzba sa preto odvodzuje zo súm
   * položky, čo platí aj pre staršie doklady.
   */
  it("sadzbu položky odvodí zo súm, nie z kódu", () => {
    expect(riadky.map((r) => r.item_vat_rate)).toEqual(["23", "19", "5", "0"]);
    expect(riadky[0].item_name).toBe("Montážne práce");
    expect(riadky[0].item_quantity).toBe("10");
    expect(riadky[0].item_unit).toBe("h");
    expect(riadky[0].item_unit_price).toBe("10.00");
    expect(riadky[0].item_total).toBe("123");
  });

  it("export z Pohody má koreň responsePack a číta sa rovnako", () => {
    const r = pohodaNaRiadky(parser.parse(XML_RESPONSE));
    expect(r).toHaveLength(4);
    expect(r[0].invoice_number).toBe("20250001");
  });

  /*
    Priehradku určuje krajina firmy. Pri slovenskej tabuľke by české 21 %
    nesedelo na `high` (23) ani na `low` (19) a spadlo by do „historyHigh" —
    doklad by sa v Pohode zaúčtoval do cudzieho riadku, ticho a bez hlásenia.
  */
  it("česká firma dostane 21 % do základnej priehradky, nie medzi historické", () => {
    const ceske = [
      { name: "Práce", quantity: 1, unit: "h", unit_price: 100, vat_rate: 21, subtotal: 100, vat_amount: 21, total: 121 },
      { name: "Kniha", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 12, subtotal: 100, vat_amount: 12, total: 112 },
    ];
    const cz = buildPohodaInvoiceXml({
      company: { ico: "12345678", country: "CZ" },
      invoices: [{ invoice: faktura, items: ceske }],
    });
    expect(cz).toContain('<inv:rateVAT>high</inv:rateVAT>');
    expect(cz).toContain('<inv:rateVAT>low</inv:rateVAT>');
    expect(cz).not.toContain("historyHigh");
    expect(cz).not.toContain("historyLow");
  });

  it("slovenskej firme ostávajú slovenské priehradky", () => {
    expect(XML).toContain('<inv:rateVAT>high</inv:rateVAT>');
    expect(XML).not.toContain("historyHigh");
  });

  it("dobropis sa označí ako dobropis", () => {
    const d = buildPohodaInvoiceXml({
      company: {},
      invoices: [{ invoice: { ...faktura, type: "credit_note" }, items: polozky }],
    });
    expect(pohodaNaRiadky(parser.parse(d))[0].document_type).toBe("credit_note");
  });

  it("cez importér ako zdroj pohoda", () => {
    const rows = parseVendorFile("pohoda", "export.xml", bajty(XML));
    const s = summarize(rows);
    expect(s.invoicesCount).toBe(1);
    expect(s.customersCount).toBe(1);
    expect(s.totalValue).toBe(208.5);
  });

  // Pohoda vie doklad vyviezť aj do ISDOC.
  it("ISDOC z Pohody sa prečíta tiež", () => {
    const isdoc = `<?xml version="1.0" encoding="utf-8"?>
<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.1">
  <DocumentType>1</DocumentType><ID>20250009</ID><IssueDate>2025-03-04</IssueDate>
  <AccountingSupplierParty><Party><PartyName><Name>My</Name></PartyName></Party></AccountingSupplierParty>
  <AccountingCustomerParty><Party><PartyName><Name>ACME s.r.o.</Name></PartyName>
    <PartyIdentification><ID>00151653</ID></PartyIdentification></Party></AccountingCustomerParty>
  <InvoiceLines><InvoiceLine><InvoicedQuantity unitCode="ks">1</InvoicedQuantity>
    <UnitPrice>10</UnitPrice><ClassifiedTaxCategory><Percent>23</Percent></ClassifiedTaxCategory>
    <Item><Description>Práca</Description></Item></InvoiceLine></InvoiceLines>
  <LegalMonetaryTotal><TaxExclusiveAmount>10</TaxExclusiveAmount><TaxInclusiveAmount>12.30</TaxInclusiveAmount></LegalMonetaryTotal>
</Invoice>`;
    const rows = parseVendorFile("pohoda", "faktura.isdoc", bajty(isdoc));
    expect(rows).toHaveLength(1);
    expect(rows[0].invoice_number).toBe("20250009");
    expect(rows[0].customer_ico).toBe("00151653");
  });

  it("cudzí súbor nevráti nič", () => {
    expect(parseVendorFile("pohoda", "x.xml", bajty("<a><b>1</b></a>"))).toEqual([]);
  });
});

describe("mPohoda JSON", () => {
  /*
   * mPohoda nie je to isté ako Pohoda: je to cloudová aplikácia toho istého
   * výrobcu, ale dáta vydáva cez rozhranie REST ako JSON. Polia podľa jej
   * otvorenej schémy (`IssuedInvoiceDto`, `DocumentAddressDto`).
   */
  const JSON_MPOHODA = JSON.stringify({
    Items: [
      {
        Id: "a1b2",
        DocumentNumber: "2025001",
        VariableSymbol: "2025001",
        IssueDate: "2025-03-04T00:00:00",
        DueDate: "2025-03-18T00:00:00",
        TaxDate: "2025-03-02T00:00:00",
        CurrencyId: "EUR",
        Text: "Za marec",
        BusinessPartnerAddress: {
          CompanyName: "ACME s.r.o.",
          IdentificationNumber: "00151653",
          TaxIdentificationNumber: "2020304050",
          VatIdentificationNumber: "SK2020304050",
          Street: "Hlavná 1",
          City: "Trnava",
          PostCode: "91701",
          Country: "SK",
          Email: "fakturacia@acme.sk",
          PhoneNumber: "0900123456",
        },
        Items: [
          {
            Text: "Montážne práce",
            Quantity: 10,
            Unit: "h",
            UnitPrice: 10,
            VatRateType: "BasicVatRate",
            PriceWithoutVat: 100,
            Vat: 23,
            PriceWithVat: 123,
          },
          {
            Text: "Liek",
            Quantity: 2,
            Unit: "ks",
            UnitPrice: 10,
            VatRateType: "SecondReducedVatRate",
            PriceWithoutVat: 20,
            Vat: 1,
            PriceWithVat: 21,
          },
        ],
        DocumentRecapitulation: { TotalPrice: 144 },
      },
    ],
  });

  it("rozpozná JSON z mPohody", () => {
    expect(jeMPohodaJson(JSON_MPOHODA)).toBe(true);
    expect(jeMPohodaJson('{"nieco":1}')).toBe(false);
    expect(jeMPohodaJson("<xml/>")).toBe(false);
  });

  const riadky = mpohodaNaRiadky(JSON.parse(JSON_MPOHODA));

  it("prečíta hlavičku aj odberateľa", () => {
    expect(riadky).toHaveLength(2);
    expect(riadky[0]).toMatchObject({
      invoice_number: "2025001",
      variable_symbol: "2025001",
      issue_date: "2025-03-04",
      due_date: "2025-03-18",
      delivery_date: "2025-03-02",
      currency: "EUR",
      customer_name: "ACME s.r.o.",
      customer_ico: "00151653",
      customer_ic_dph: "SK2020304050",
      customer_city: "Trnava",
      total: "144",
    });
  });

  // `VatRateType` je len druh sadzby, nie percento — to sa odvodí zo súm.
  it("sadzba sa odvodí zo súm položky", () => {
    expect(riadky.map((r) => r.item_vat_rate)).toEqual(["23", "5"]);
    expect(riadky[0].item_name).toBe("Montážne práce");
    expect(riadky[0].item_unit).toBe("h");
    expect(riadky[1].item_total).toBe("21");
  });

  it("holé pole faktúr aj jediná faktúra", () => {
    const zoznam = JSON.parse(JSON_MPOHODA).Items;
    expect(mpohodaNaRiadky(zoznam)).toHaveLength(2);
    expect(mpohodaNaRiadky(zoznam[0])).toHaveLength(2);
  });

  it("cez importér ako zdroj pohoda", () => {
    const rows = parseVendorFile("pohoda", "faktury.json", bajty(JSON_MPOHODA));
    const s = summarize(rows);
    expect(s.invoicesCount).toBe(1);
    expect(s.totalValue).toBe(144);
    expect(s.currency).toBe("EUR");
  });

  it("poškodený JSON nespadne", () => {
    expect(parseVendorFile("pohoda", "x.json", bajty('{"DocumentNumber": '))).toEqual([]);
  });
});
