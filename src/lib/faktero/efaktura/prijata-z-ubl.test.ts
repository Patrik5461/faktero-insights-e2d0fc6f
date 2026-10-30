import { describe, expect, it } from "vitest";
import { mapToEN16931 } from "./en16931.server";
import { generatePeppolBisXml } from "./xml.server";
import { parseEfakturaEnvelope } from "./inbound.server";
import {
  druhZTypu,
  prijataZUbl,
  rozoberPrijatuUbl,
  udajeNespracovanehoZUbl,
} from "./prijata-z-ubl";
import { prazdneUdaje, prijataZUdajov } from "../nespracovane";

const firma: any = {
  name: "Test s.r.o.",
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
const faktura = (o: any = {}): any => ({
  invoice_number: "FA2026001",
  type: "regular",
  issue_date: "2026-10-08",
  due_date: "2026-10-22",
  currency: "EUR",
  variable_symbol: "2026001",
  subtotal: 1000,
  vat_total: 230,
  total: 1230,
  customer_name: "test2 s.r.o.",
  customer_ico: "43291067",
  customer_dic: "5843291067",
  customer_ic_dph: "SK5843291067",
  customer_country: "SK",
  ...o,
});
const polozka = (o: any = {}): any => ({
  position: 1,
  name: "Služba",
  quantity: 1,
  unit: "ks",
  unit_price: 1000,
  vat_rate: 23,
  subtotal: 1000,
  vat_amount: 230,
  total: 1230,
  ...o,
});
const v = { dnes: "2026-10-29", prijate: "2026-10-28", nahradneCislo: "EF-1" };

describe("prijatá eFaktúra so zaplatenou zálohou (PrepaidAmount)", () => {
  const xml = generatePeppolBisXml(
    mapToEN16931({ company: firma, invoice: faktura({ advance_amount: 615 }), items: [polozka()] }),
  ).xml;

  it("celková suma je s DPH, záloha a suma na úhradu zvlášť", () => {
    const r = rozoberPrijatuUbl(xml)!;
    expect(r.druh).toBe("faktura");
    expect(r.celkom).toBe(1230);
    expect(r.zaklad).toBe(1000);
    expect(r.dph).toBe(230);
    expect(r.zaloha).toBe(615);
    expect(r.naUhradu).toBe(615);
    expect(r.rozpis).toEqual([{ sadzba: 23, kategoria: "S", zaklad: 1000, dph: 230 }]);
  });

  it("prijatá faktúra má odpočet zálohy v advance_amount, nie len v poznámke", () => {
    const p = prijataZUbl(rozoberPrijatuUbl(xml)!, v);
    expect(p.amount_total).toBe(1230);
    expect(p.amount_without_vat).toBe(1000);
    expect(p.vat_amount).toBe(230);
    expect(p.advance_amount).toBe(615);
    // Suma na úhradu = celkom − záloha = PayableAmount.
    expect(p.amount_total - (p.advance_amount ?? 0)).toBe(615);
    expect(p.items).toEqual([
      { name: "Služba", quantity: 1, unit: "ks", unit_price: 1000, vat_rate: 23, total: 1000 },
    ]);
    expect(p.supplier_ico).toBe("86179504");
    expect(p.supplier_iban).toBe("SK3112000000198742637541");
    expect(p.variable_symbol).toBe("2026001");
  });

  it("hlavička pri príjme berie tie isté sumy", () => {
    const h = parseEfakturaEnvelope(xml);
    expect(h.total).toBe(1230);
    expect(h.vatTotal).toBe(230);
    expect(h.prepaid).toBe(615);
    expect(h.payable).toBe(615);
  });

  it("cez Nespracované prejde záloha až do prijatej faktúry", () => {
    const u = udajeNespracovanehoZUbl(rozoberPrijatuUbl(xml)!, prazdneUdaje());
    expect(u.celkom).toBe(1230);
    expect(u.zaloha).toBe(615);
    const p = prijataZUdajov("faktura", u, "2026-10-29");
    expect(p.amount_total).toBe(1230);
    expect(p.advance_amount).toBe(615);
  });
});

describe("prijatá eFaktúra bez zálohy", () => {
  it("na úhradu je celá suma, advance_amount ostáva prázdny", () => {
    const xml = generatePeppolBisXml(
      mapToEN16931({ company: firma, invoice: faktura(), items: [polozka()] }),
    ).xml;
    const r = rozoberPrijatuUbl(xml)!;
    expect(r.zaloha).toBe(0);
    expect(r.naUhradu).toBe(1230);
    const p = prijataZUbl(r, v);
    expect(p.amount_total).toBe(1230);
    expect(p.advance_amount).toBeNull();
    expect(p.note).toBe("Prijaté cez eFaktúru (Peppol).");
  });

  it("zdanená záloha záporným riadkom zníži základ aj DPH — do advance_amount nejde", () => {
    const xml = generatePeppolBisXml(
      mapToEN16931({
        company: firma,
        invoice: faktura(),
        items: [polozka()],
        zalohy: [
          {
            zaloha: "ZF1",
            doklad: "DP1",
            vs: null,
            suma: 615,
            riadky: [{ sadzba: 23, zaklad: 500, dph: 115 }],
          },
        ],
      }),
    ).xml;
    const p = prijataZUbl(rozoberPrijatuUbl(xml)!, v);
    expect(p.amount_total).toBe(615);
    expect(p.amount_without_vat).toBe(500);
    expect(p.vat_amount).toBe(115);
    expect(p.advance_amount).toBeNull();
    expect(p.items?.map((x) => x.total)).toEqual([1000, -500]);
  });
});

/* Ručne písané XML: iné predpony, dve sadzby, zľava na doklad, DPH v mene
   účtovania (druhý TaxTotal) a zaokrúhlenie. */
const vlastne = `<?xml version="1.0" encoding="UTF-8"?>
<inv:Invoice xmlns:inv="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:a="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:b="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <b:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</b:CustomizationID>
  <b:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</b:ProfileID>
  <b:ID>2026/77</b:ID>
  <b:IssueDate>2026-10-20</b:IssueDate>
  <b:DueDate>2026-11-03</b:DueDate>
  <b:InvoiceTypeCode>380</b:InvoiceTypeCode>
  <b:DocumentCurrencyCode>EUR</b:DocumentCurrencyCode>
  <b:TaxCurrencyCode>CZK</b:TaxCurrencyCode>
  <a:AccountingSupplierParty><a:Party>
    <b:EndpointID schemeID="0245">2120000000</b:EndpointID>
    <a:PostalAddress><b:StreetName>Dlhá 5</b:StreetName><b:CityName>Žilina</b:CityName><b:PostalZone>01001</b:PostalZone><a:Country><b:IdentificationCode>SK</b:IdentificationCode></a:Country></a:PostalAddress>
    <a:PartyTaxScheme><b:CompanyID>SK2120000000</b:CompanyID><a:TaxScheme><b:ID>VAT</b:ID></a:TaxScheme></a:PartyTaxScheme>
    <a:PartyLegalEntity><b:RegistrationName>Dodávateľ a.s.</b:RegistrationName><b:CompanyID>12345678</b:CompanyID></a:PartyLegalEntity>
  </a:Party></a:AccountingSupplierParty>
  <a:Delivery><b:ActualDeliveryDate>2026-10-15</b:ActualDeliveryDate></a:Delivery>
  <a:PaymentMeans><b:PaymentMeansCode>58</b:PaymentMeansCode><b:PaymentID>202677</b:PaymentID><a:PayeeFinancialAccount><b:ID>SK89 1100 0000 0026 2610 0001</b:ID></a:PayeeFinancialAccount></a:PaymentMeans>
  <a:AllowanceCharge><b:ChargeIndicator>false</b:ChargeIndicator><b:AllowanceChargeReason>Zľava za vernosť</b:AllowanceChargeReason><b:Amount currencyID="EUR">10.00</b:Amount><a:TaxCategory><b:ID>S</b:ID><b:Percent>23</b:Percent><a:TaxScheme><b:ID>VAT</b:ID></a:TaxScheme></a:TaxCategory></a:AllowanceCharge>
  <a:TaxTotal><b:TaxAmount currencyID="CZK">999.00</b:TaxAmount></a:TaxTotal>
  <a:TaxTotal>
    <b:TaxAmount currencyID="EUR">25.70</b:TaxAmount>
    <a:TaxSubtotal><b:TaxableAmount currencyID="EUR">90.00</b:TaxableAmount><b:TaxAmount currencyID="EUR">20.70</b:TaxAmount><a:TaxCategory><b:ID>S</b:ID><b:Percent>23</b:Percent><a:TaxScheme><b:ID>VAT</b:ID></a:TaxScheme></a:TaxCategory></a:TaxSubtotal>
    <a:TaxSubtotal><b:TaxableAmount currencyID="EUR">100.00</b:TaxableAmount><b:TaxAmount currencyID="EUR">5.00</b:TaxAmount><a:TaxCategory><b:ID>S</b:ID><b:Percent>5</b:Percent><a:TaxScheme><b:ID>VAT</b:ID></a:TaxScheme></a:TaxCategory></a:TaxSubtotal>
  </a:TaxTotal>
  <a:LegalMonetaryTotal>
    <b:LineExtensionAmount currencyID="EUR">200.00</b:LineExtensionAmount>
    <b:TaxExclusiveAmount currencyID="EUR">190.00</b:TaxExclusiveAmount>
    <b:TaxInclusiveAmount currencyID="EUR">215.70</b:TaxInclusiveAmount>
    <b:AllowanceTotalAmount currencyID="EUR">10.00</b:AllowanceTotalAmount>
    <b:PayableRoundingAmount currencyID="EUR">0.30</b:PayableRoundingAmount>
    <b:PayableAmount currencyID="EUR">216.00</b:PayableAmount>
  </a:LegalMonetaryTotal>
  <a:InvoiceLine><b:ID>1</b:ID><b:InvoicedQuantity unitCode="HUR">4</b:InvoicedQuantity><b:LineExtensionAmount currencyID="EUR">100.00</b:LineExtensionAmount>
    <a:Item><b:Name>Montáž</b:Name><a:ClassifiedTaxCategory><b:ID>S</b:ID><b:Percent>23</b:Percent><a:TaxScheme><b:ID>VAT</b:ID></a:TaxScheme></a:ClassifiedTaxCategory></a:Item>
    <a:Price><b:PriceAmount currencyID="EUR">25.00</b:PriceAmount></a:Price></a:InvoiceLine>
  <a:InvoiceLine><b:ID>2</b:ID><b:InvoicedQuantity unitCode="C62">10</b:InvoicedQuantity><b:LineExtensionAmount currencyID="EUR">100.00</b:LineExtensionAmount>
    <a:Item><b:Name>Knihy</b:Name><a:ClassifiedTaxCategory><b:ID>S</b:ID><b:Percent>5</b:Percent><a:TaxScheme><b:ID>VAT</b:ID></a:TaxScheme></a:ClassifiedTaxCategory></a:Item>
    <a:Price><b:PriceAmount currencyID="EUR">100.00</b:PriceAmount><b:BaseQuantity unitCode="C62">10</b:BaseQuantity></a:Price></a:InvoiceLine>
</inv:Invoice>`;

describe("rozpis po sadzbách, zľava na doklad a iné predpony", () => {
  const r = rozoberPrijatuUbl(vlastne)!;

  it("DPH sa berie z TaxTotal v mene dokladu, nie z TaxTotal v mene účtovania", () => {
    expect(r.dph).toBe(25.7);
    expect(r.zaklad).toBe(190);
    expect(r.celkom).toBe(215.7);
    expect(r.zaokruhlenie).toBe(0.3);
    expect(r.naUhradu).toBe(216);
    expect(r.rozpis.map((x) => [x.sadzba, x.zaklad, x.dph])).toEqual([
      [23, 90, 20.7],
      [5, 100, 5],
    ]);
    expect(parseEfakturaEnvelope(vlastne).vatTotal).toBe(25.7);
  });

  it("zľava na doklad je riadok, súčet položiek sedí so základom", () => {
    expect(r.polozky.map((p) => [p.name, p.vat_rate, p.total])).toEqual([
      ["Montáž", 23, 100],
      ["Knihy", 5, 100],
      ["Zľava za vernosť", 23, -10],
    ]);
    expect(r.polozky.reduce((a, p) => a + (p.total ?? 0), 0)).toBe(r.zaklad);
    expect(r.polozky[0].unit).toBe("hod");
    expect(r.polozky[1].unit_price).toBe(10);
  });

  it("dodávateľ, platba a dodanie z XML", () => {
    expect(r.dodavatel).toMatchObject({
      nazov: "Dodávateľ a.s.",
      ico: "12345678",
      dic: "2120000000",
      icDph: "SK2120000000",
      ulica: "Dlhá 5",
      mesto: "Žilina",
      psc: "01001",
      krajina: "SK",
    });
    expect(r.iban).toBe("SK8911000000002626100001");
    expect(r.vs).toBe("202677");
    expect(r.platba).toBe("prevod");
    expect(r.dodanie).toBe("2026-10-15");
    expect(r.cislo).toBe("2026/77");
  });
});

describe("druh dokladu", () => {
  it("zálohová faktúra (386) je proforma bez odpočtu DPH", () => {
    const xml = vlastne.replace(
      "<b:InvoiceTypeCode>380</b:InvoiceTypeCode>",
      "<b:InvoiceTypeCode>386</b:InvoiceTypeCode>",
    );
    const p = prijataZUbl(rozoberPrijatuUbl(xml)!, v);
    expect(p.type).toBe("proforma");
    expect(p.odpocet).toBe(false);
  });

  it("dobropis má záporné sumy a číslo pôvodnej faktúry", () => {
    const xml = vlastne
      .replace(
        "<b:InvoiceTypeCode>380</b:InvoiceTypeCode>",
        "<b:InvoiceTypeCode>381</b:InvoiceTypeCode>",
      )
      .replace(
        "<a:AccountingSupplierParty>",
        "<a:BillingReference><a:InvoiceDocumentReference><b:ID>2026/50</b:ID></a:InvoiceDocumentReference></a:BillingReference><a:AccountingSupplierParty>",
      );
    const p = prijataZUbl(rozoberPrijatuUbl(xml)!, v);
    expect(p.amount_total).toBe(-215.7);
    expect(p.vat_amount).toBe(-25.7);
    expect(p.opravuje_cislo).toBe("2026/50");
  });

  it("samofaktúru spozná podľa typu aj procesu", () => {
    expect(druhZTypu("389", false, null)).toBe("samofaktura");
    expect(druhZTypu("261", true, null)).toBe("samofaktura_dobropis");
    expect(druhZTypu("380", false, "urn:fdc:peppol.eu:2017:poacc:selfbilling:01:1.0")).toBe(
      "samofaktura",
    );
    expect(druhZTypu("380", false, null)).toBe("faktura");
  });

  it("neplatné XML vráti null — príjem ostane pri hlavičke", () => {
    expect(rozoberPrijatuUbl("<Invoice><cbc:ID>1")).toBeNull();
  });
});

describe("suma na úhradu prijatej faktúry", () => {
  it("odpočet na doklade má prednosť pred zálohovou z väzby", async () => {
    const { zalohaPrijatej, stavUhradyPrijatej } = await import("../uhrady-prijatej");
    expect(zalohaPrijatej(615, 400)).toBe(615);
    expect(zalohaPrijatej(null, 400)).toBe(400);
    expect(zalohaPrijatej(0, 0)).toBe(0);
    const s = stavUhradyPrijatej({
      amount_total: 1230,
      uhrady: [],
      zaloha: zalohaPrijatej(615, 0),
    });
    expect(s.naUhradu).toBe(615);
  });
});

describe("odberateľ z eFaktúry (kontrola, či faktúra patrí firme)", () => {
  const xml = generatePeppolBisXml(
    mapToEN16931({ company: firma, invoice: faktura(), items: [polozka()] }),
  ).xml;

  it("rozobratie vráti odberateľa s IČO, DIČ a IČ DPH", () => {
    const r = rozoberPrijatuUbl(xml)!;
    expect(r.odberatel).toMatchObject({ ico: "43291067", icDph: "SK5843291067" });
    expect(r.odberatel?.nazov).toBeTruthy();
  });

  it("eFaktúra pre inú firmu dostane príznak, pre správnu nie", async () => {
    const { overOdberatela } = await import("../cudzia-faktura");
    const r = rozoberPrijatuUbl(xml)!;
    expect(
      overOdberatela({
        odberatel: r.odberatel,
        dodavatel: r.dodavatel,
        firma: { ico: "43291067" },
      }),
    ).toBeNull();
    expect(
      overOdberatela({ odberatel: r.odberatel, dodavatel: r.dodavatel, firma: { ico: "11111111" } })
        ?.dovod,
    ).toBe("ico");
  });
});
