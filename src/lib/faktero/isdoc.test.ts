import { describe, it, expect } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { isdocNaRiadky, jeIsdoc, typDokladu } from "./isdoc";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  removeNSPrefix: true,
});

const XML = `<?xml version="1.0" encoding="utf-8"?>
<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.1">
  <DocumentType>1</DocumentType>
  <ID>2025001</ID>
  <UUID>7B4C5BE0-288C-11D2-8E62-004095452B84</UUID>
  <IssueDate>2025-03-04</IssueDate>
  <TaxPointDate>2025-03-02</TaxPointDate>
  <Note>Poznámka k dokladu</Note>
  <LocalCurrencyCode>EUR</LocalCurrencyCode>
  <AccountingSupplierParty><Party>
    <PartyName><Name>Dodávateľ s.r.o.</Name></PartyName>
  </Party></AccountingSupplierParty>
  <AccountingCustomerParty><Party>
    <PartyIdentification><ID>12345678</ID></PartyIdentification>
    <PartyName><Name>ACME s.r.o.</Name></PartyName>
    <PostalAddress>
      <StreetName>Hlavná</StreetName>
      <BuildingNumber>12</BuildingNumber>
      <CityName>Trnava</CityName>
      <PostalZone>91701</PostalZone>
      <Country><IdentificationCode>SK</IdentificationCode></Country>
    </PostalAddress>
    <PartyTaxScheme><CompanyID>SK2020304050</CompanyID></PartyTaxScheme>
    <Contact><Telephone>0900123456</Telephone><ElectronicMail>fakturacia@acme.sk</ElectronicMail></Contact>
  </Party></AccountingCustomerParty>
  <InvoiceLines>
    <InvoiceLine>
      <ID>1</ID>
      <InvoicedQuantity unitCode="ks">10</InvoicedQuantity>
      <LineExtensionAmount>100.00</LineExtensionAmount>
      <LineExtensionAmountTaxInclusive>123.00</LineExtensionAmountTaxInclusive>
      <UnitPrice>10.00</UnitPrice>
      <ClassifiedTaxCategory><Percent>23</Percent></ClassifiedTaxCategory>
      <Note>Poznámka k položke</Note>
      <Item>
        <Description>Montážne práce</Description>
        <SellersItemIdentification><ID>MP-01</ID></SellersItemIdentification>
      </Item>
    </InvoiceLine>
    <InvoiceLine>
      <ID>2</ID>
      <InvoicedQuantity unitCode="h">2</InvoicedQuantity>
      <LineExtensionAmount>50.00</LineExtensionAmount>
      <LineExtensionAmountTaxInclusive>59.50</LineExtensionAmountTaxInclusive>
      <UnitPrice>25.00</UnitPrice>
      <ClassifiedTaxCategory><Percent>19</Percent></ClassifiedTaxCategory>
      <Item><Description>Doprava</Description></Item>
    </InvoiceLine>
  </InvoiceLines>
  <LegalMonetaryTotal>
    <TaxExclusiveAmount>150.00</TaxExclusiveAmount>
    <TaxInclusiveAmount>182.50</TaxInclusiveAmount>
    <PayableAmount>182.50</PayableAmount>
  </LegalMonetaryTotal>
  <PaymentMeans><Payment><Details>
    <PaymentDueDate>2025-03-18</PaymentDueDate>
    <VariableSymbol>2025001</VariableSymbol>
  </Details></Payment></PaymentMeans>
</Invoice>`;

const doc = parser.parse(XML);
const riadky = isdocNaRiadky(doc);

describe("jeIsdoc", () => {
  it("pozná ISDOC podľa menného priestoru", () => {
    expect(jeIsdoc(XML)).toBe(true);
  });

  // SuperFaktúra súbor niekedy pomenuje .xml, takže prípona nestačí.
  it("pozná ISDOC aj bez menného priestoru", () => {
    expect(
      jeIsdoc("<Invoice><AccountingSupplierParty/><InvoiceLines></InvoiceLines></Invoice>"),
    ).toBe(true);
  });

  it("obyčajné XML za ISDOC nepovažuje", () => {
    expect(jeIsdoc("<Invoices><Invoice><invoice_no>1</invoice_no></Invoice></Invoices>")).toBe(
      false,
    );
    expect(jeIsdoc("")).toBe(false);
  });
});

describe("typDokladu", () => {
  it("prevedie číselník ISDOC", () => {
    expect(typDokladu("1")).toBe("regular");
    expect(typDokladu("2")).toBe("credit_note");
    expect(typDokladu("4")).toBe("proforma");
    expect(typDokladu("")).toBe("regular");
  });
});

describe("isdocNaRiadky", () => {
  // Jeden riadok = jedna položka, hlavička sa opakuje — tak zvyšok importu
  // faktúry zoskupuje.
  it("vyrobí riadok na každú položku", () => {
    expect(riadky).toHaveLength(2);
    expect(riadky.map((r) => r.item_name)).toEqual(["Montážne práce", "Doprava"]);
    expect(new Set(riadky.map((r) => r.invoice_number))).toEqual(new Set(["2025001"]));
  });

  it("prečíta hlavičku faktúry", () => {
    expect(riadky[0]).toMatchObject({
      invoice_number: "2025001",
      issue_date: "2025-03-04",
      delivery_date: "2025-03-02",
      due_date: "2025-03-18",
      variable_symbol: "2025001",
      currency: "EUR",
      notes: "Poznámka k dokladu",
      external_id: "7B4C5BE0-288C-11D2-8E62-004095452B84",
    });
  });

  // Dodávateľ je vlastná firma; do importu patrí odberateľ.
  it("berie odberateľa, nie dodávateľa", () => {
    expect(riadky[0].customer_name).toBe("ACME s.r.o.");
    expect(riadky[0].customer_ico).toBe("12345678");
    expect(riadky[0].customer_ic_dph).toBe("SK2020304050");
    expect(riadky[0].customer_dic).toBe("2020304050");
    expect(riadky[0].customer_street).toBe("Hlavná 12");
    expect(riadky[0].customer_city).toBe("Trnava");
    expect(riadky[0].customer_zip).toBe("91701");
    expect(riadky[0].customer_country).toBe("SK");
    expect(riadky[0].customer_email).toBe("fakturacia@acme.sk");
  });

  it("dopočíta DPH zo súčtov", () => {
    expect(riadky[0].subtotal).toBe("150");
    expect(riadky[0].vat_total).toBe("32.5");
    expect(riadky[0].total).toBe("182.5");
  });

  it("prečíta položku vrátane mernej jednotky z atribútu", () => {
    expect(riadky[0]).toMatchObject({
      item_quantity: "10",
      item_unit: "ks",
      item_unit_price: "10",
      item_vat_rate: "23",
      item_total: "123",
      item_sku: "MP-01",
      item_description: "Poznámka k položke",
    });
    expect(riadky[1].item_unit).toBe("h");
    expect(riadky[1].item_vat_rate).toBe("19");
  });

  // Pri plne zálohovanej faktúre je PayableAmount nula — brať ju ako celkovú
  // sumu by z faktúry urobilo doklad na 0 €.
  it("celková suma sa berie z TaxInclusiveAmount, nie z PayableAmount", () => {
    const zaplatena = XML.replace(
      "<PayableAmount>182.50</PayableAmount>",
      "<PayableAmount>0</PayableAmount>",
    );
    const r = isdocNaRiadky(parser.parse(zaplatena));
    expect(r[0].total).toBe("182.5");
  });

  it("faktúra bez položiek dá aspoň hlavičku", () => {
    const bezPoloziek = XML.replace(/<InvoiceLines>[\s\S]*<\/InvoiceLines>/, "");
    const r = isdocNaRiadky(parser.parse(bezPoloziek));
    expect(r).toHaveLength(1);
    expect(r[0].invoice_number).toBe("2025001");
    expect(r[0].item_name).toBeUndefined();
  });

  it("jediná položka nezabalená do poľa sa prečíta rovnako", () => {
    const jedna = XML.replace(/<InvoiceLine>\s*<ID>2<\/ID>[\s\S]*?<\/InvoiceLine>/, "");
    const r = isdocNaRiadky(parser.parse(jedna));
    expect(r).toHaveLength(1);
    expect(r[0].item_name).toBe("Montážne práce");
  });

  it("dobropis sa označí ako dobropis", () => {
    const d = XML.replace("<DocumentType>1</DocumentType>", "<DocumentType>2</DocumentType>");
    expect(isdocNaRiadky(parser.parse(d))[0].document_type).toBe("credit_note");
  });

  it("prázdny vstup nespadne", () => {
    expect(isdocNaRiadky(null)).toEqual([]);
    expect(isdocNaRiadky({})).toEqual([]);
  });
});
