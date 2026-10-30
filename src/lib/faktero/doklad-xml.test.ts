import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { dokladZXml } from "./doklad-xml";
import { buildIsdoc } from "./isdoc-export";
import { dokladZPrilohy, prilohyPdf } from "./pdf-prilohy.server";
import { navrhDruhu, udajeZAi, rozpisZAi } from "./nespracovane";

const company: any = {
  name: "Papiernictvo Orava s.r.o.",
  ico: "36398527",
  dic: "2021734521",
  ic_dph: "SK2021734521",
  iban: "SK3111000000002612345678",
  country: "SK",
  default_currency: "EUR",
  street: "Hlavná 12",
  city: "Dolný Kubín",
  zip: "02601",
};
const invoice: any = {
  id: "f1",
  type: "regular",
  invoice_number: "2026-0815",
  variable_symbol: "20260815",
  issue_date: "2026-10-10",
  delivery_date: "2026-10-09",
  due_date: "2026-10-24",
  currency: "EUR",
  subtotal: 40,
  vat_total: 9.2,
  total: 49.2,
  customer_name: "Test s.r.o.",
  customer_ico: "44444444",
};
const items: any[] = [
  {
    name: "Kancelársky papier A4",
    quantity: 10,
    unit: "bal",
    unit_price: 4,
    subtotal: 40,
    vat_amount: 9.2,
    vat_rate: 23,
    total: 49.2,
  },
];

const CII = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocument>
    <ram:ID>RE-2026-77</ram:ID><ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">20261005</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:SpecifiedTradeProduct><ram:Name>Wartung Server</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>50.00</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="HUR">2</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>19</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>100.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>Muster IT GmbH</ram:Name>
        <ram:PostalTradeAddress><ram:PostcodeCode>10115</ram:PostcodeCode><ram:LineOne>Hauptstr. 1</ram:LineOne><ram:CityName>Berlin</ram:CityName><ram:CountryID>DE</ram:CountryID></ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">DE123456789</ram:ID></ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>Test s.r.o.</ram:Name></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>RE-2026-77</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>DE02120300000000202051</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>
      </ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:ApplicableTradeTax><ram:CalculatedAmount>19.00</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>100.00</ram:BasisAmount><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>19</ram:RateApplicablePercent></ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">20261019</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>100.00</ram:LineTotalAmount><ram:TaxBasisTotalAmount>100.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">19.00</ram:TaxTotalAmount><ram:GrandTotalAmount>119.00</ram:GrandTotalAmount>
        <ram:DuePayableAmount>119.00</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

const UBL_DOBROPIS = `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>DB-12</cbc:ID><cbc:IssueDate>2026-10-11</cbc:IssueDate><cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PostalAddress><cbc:StreetName>Mlynská 5</cbc:StreetName><cbc:CityName>Košice</cbc:CityName><cbc:PostalZone>04001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>SK</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>SK2020111222</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Servis Východ s.r.o.</cbc:RegistrationName><cbc:CompanyID>50111222</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>Test s.r.o.</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">2.30</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="EUR">10.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">12.30</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">12.30</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:CreditNoteLine><cbc:ID>1</cbc:ID><cbc:CreditedQuantity unitCode="C62">1</cbc:CreditedQuantity><cbc:LineExtensionAmount currencyID="EUR">10.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Vrátenie za servis</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>23</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">10.00</cbc:PriceAmount></cac:Price></cac:CreditNoteLine>
</CreditNote>`;

describe("údaje faktúry z XML", () => {
  it("ISDOC z vlastného exportu sa prečíta späť", () => {
    const d = dokladZXml(buildIsdoc({ invoice, items, company }))!;
    expect(d.zdroj_udajov).toBe("isdoc");
    expect(d).toMatchObject({
      supplier_name: "Papiernictvo Orava s.r.o.",
      supplier_ico: "36398527",
      invoice_number: "2026-0815",
      variable_symbol: "20260815",
      issue_date: "2026-10-10",
      due_date: "2026-10-24",
      amount_without_vat: 40,
      vat_amount: 9.2,
      amount_total: 49.2,
      document_subtype: "ostra",
    });
    expect((d.items as any[])[0]).toMatchObject({
      name: "Kancelársky papier A4",
      quantity: 10,
      vat_rate: 23,
      total: 49.2,
    });
    const u = udajeZAi(d, "2026-10-14");
    expect(u.dodavatel.nazov).toBe("Papiernictvo Orava s.r.o.");
    expect(navrhDruhu(d)).toBe("faktura");
    expect(rozpisZAi(d)).toEqual([{ sadzba: 23, zaklad: 40, dph: 9.2 }]);
  });

  it("ZUGFeRD / Factur-X (CII)", () => {
    const d = dokladZXml(CII)!;
    expect(d.zdroj_udajov).toBe("zugferd");
    expect(d).toMatchObject({
      supplier_name: "Muster IT GmbH",
      supplier_ic_dph: "DE123456789",
      supplier_iban: "DE02120300000000202051",
      supplier_city: "Berlin",
      invoice_number: "RE-2026-77",
      issue_date: "2026-10-05",
      due_date: "2026-10-19",
      amount_without_vat: 100,
      vat_amount: 19,
      amount_total: 119,
      reverse_charge: false,
    });
    expect((d.items as any[])[0]).toMatchObject({
      name: "Wartung Server",
      quantity: 2,
      // Kód UN/ECE Rec. 20 sa preloží na jednotku, ktorú pozná človek.
      unit: "hod",
      unit_price: 50,
      vat_rate: 19,
      total: 119,
    });
  });

  it("UBL dobropis z Peppolu", () => {
    const d = dokladZXml(UBL_DOBROPIS)!;
    expect(d.zdroj_udajov).toBe("ubl");
    expect(d).toMatchObject({
      supplier_name: "Servis Východ s.r.o.",
      supplier_ico: "50111222",
      supplier_ic_dph: "SK2020111222",
      invoice_number: "DB-12",
      amount_total: 12.3,
      document_subtype: "dobropis",
    });
    expect((d.items as any[])[0].unit).toBe("ks");
    expect(navrhDruhu(d)).toBe("dobropis");
  });

  it("neznáme XML ani text nie je faktúra", () => {
    expect(dokladZXml("<root><a>1</a></root>")).toBeNull();
    expect(dokladZXml("toto nie je xml")).toBeNull();
    expect(dokladZXml("")).toBeNull();
  });
});

describe("ISDOC v cudzej mene", () => {
  it("sumy a mena sa berú z mena faktúry (…Curr), nie z domácej meny vystaviteľa", () => {
    // Slovenská firma fakturuje v korunách: domáca mena EUR, faktúra v CZK.
    const xml = buildIsdoc({
      invoice: {
        ...invoice,
        currency: "CZK",
        exchange_rate: 25,
        subtotal: 1000,
        vat_total: 230,
        total: 1230,
      },
      items: [
        { ...items[0], quantity: 4, unit_price: 250, subtotal: 1000, vat_amount: 230, total: 1230 },
      ],
      company,
    });
    expect(xml).toContain("<ForeignCurrencyCode>CZK</ForeignCurrencyCode>");
    const d = dokladZXml(xml)!;
    expect(d).toMatchObject({
      currency: "CZK",
      amount_without_vat: 1000,
      vat_amount: 230,
      amount_total: 1230,
    });
    expect((d.items as any[])[0]).toMatchObject({ quantity: 4, unit_price: 250, total: 1230 });
  });
});

describe("XML vložené v PDF", () => {
  async function pdfSPrilohou(nazov: string, obsah: string) {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    await pdf.attach(new TextEncoder().encode(obsah), nazov, { mimeType: "application/xml" });
    return pdf.save();
  }

  it("ISDOC priložený v PDF sa nájde a prečíta", async () => {
    const bajty = await pdfSPrilohou("faktura.isdoc", buildIsdoc({ invoice, items, company }));
    expect((await prilohyPdf(bajty)).map((p) => p.nazov)).toEqual(["faktura.isdoc"]);
    const d = await dokladZPrilohy(bajty, "application/pdf");
    expect(d?.zdroj_udajov).toBe("isdoc");
    expect(d?.amount_total).toBe(49.2);
  });

  it("Factur-X v PDF", async () => {
    const d = await dokladZPrilohy(
      await pdfSPrilohou("factur-x.xml", CII),
      "application/octet-stream",
    );
    expect(d?.zdroj_udajov).toBe("zugferd");
    expect(d?.invoice_number).toBe("RE-2026-77");
  });

  it("PDF bez prílohy a obrázok idú na AI", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    expect(await dokladZPrilohy(await pdf.save(), "application/pdf")).toBeNull();
    expect(await dokladZPrilohy(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBeNull();
  });

  it("samotný ISDOC súbor", async () => {
    const d = await dokladZPrilohy(
      new TextEncoder().encode(buildIsdoc({ invoice, items, company })),
      "application/octet-stream",
    );
    expect(d?.supplier_ico).toBe("36398527");
  });
});
