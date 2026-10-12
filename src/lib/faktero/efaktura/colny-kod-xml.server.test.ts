import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { mapToEN16931 } from "./en16931.server";
import { generatePeppolBisXml } from "./xml.server";
import { teloOdoslania } from "./epostak-telo";

/*
  Colný kód (BT-158) a krajina pôvodu (BT-159) v UBL. Výstup overený
  validátorom ePoštáka (UBL XSD + EN 16931 + Peppol BIS) 2026-10-12.
*/
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
const faktura: any = {
  invoice_number: "FA2026099",
  type: "regular",
  issue_date: "2026-10-12",
  due_date: "2026-10-26",
  currency: "EUR",
  variable_symbol: "2026099",
  subtotal: 1000,
  vat_total: 230,
  total: 1230,
  customer_name: "test2 s.r.o.",
  customer_ico: "43291067",
  customer_dic: "5843291067",
  customer_ic_dph: "SK5843291067",
  customer_country: "SK",
};
const polozka: any = {
  position: 1,
  name: "Smartfón",
  description: "Model X, 128 GB",
  quantity: 1,
  unit: "ks",
  unit_price: 1000,
  vat_rate: 23,
  subtotal: 1000,
  vat_amount: 230,
  total: 1230,
  colny_kod: "85171300",
  krajina_povodu: "CN",
};

describe("colný kód v eFaktúre", () => {
  it("UBL nesie OriginCountry a CommodityClassification v správnom poradí", () => {
    const r = generatePeppolBisXml(
      mapToEN16931({ company: firma, invoice: faktura, items: [polozka] }),
    );
    expect(r.validationErrors).toEqual([]);
    expect(r.xml).toContain(
      '<cbc:ItemClassificationCode listID="HS">85171300</cbc:ItemClassificationCode>',
    );
    expect(r.xml).toContain(
      "<cac:OriginCountry><cbc:IdentificationCode>CN</cbc:IdentificationCode></cac:OriginCountry>",
    );
    // UBL: Description → Name → OriginCountry → CommodityClassification → ClassifiedTaxCategory.
    const i = (t: string) => r.xml.indexOf(t);
    expect(i("<cbc:Description>Model X")).toBeLessThan(i("<cbc:Name>Smartfón"));
    expect(i("<cbc:Name>Smartfón")).toBeLessThan(i("<cac:OriginCountry>"));
    expect(i("<cac:OriginCountry>")).toBeLessThan(i("<cac:CommodityClassification>"));
    expect(i("<cac:CommodityClassification>")).toBeLessThan(i("<cac:ClassifiedTaxCategory>"));
    if (process.env.ULOZ_UBL) writeFileSync(process.env.ULOZ_UBL, r.xml);
  });

  it("ePošták dostane customsTariffCode", () => {
    const telo: any = teloOdoslania({
      druh: "invoice",
      cislo: "FA2026099",
      vystavena: "2026-10-12",
      splatnost: "2026-10-26",
      dodanie: null,
      mena: "EUR",
      vs: null,
      iban: null,
      poznamka: null,
      buyerReference: "x",
      protistranaPeppolId: "0245:5843291067",
      protistranaNazov: "test2",
      polozky: [
        { name: "Smartfón", quantity: 1, unit_price: 1000, vat_rate: 23, colny_kod: "8517 13 00" },
      ],
    } as any);
    expect(telo.items[0].customsTariffCode).toBe("85171300");
  });
});
