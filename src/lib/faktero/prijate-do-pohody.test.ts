import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { buildPohodaExpensesXml } from "./export.server";
import { prijataAkoDoklad, rozpisPrijatej } from "./prijate-do-pohody";

const firma: any = { name: "Faktero Demo s.r.o.", ico: "55555555", country: "SK" };
const prijata = {
  id: "11111111-1111-1111-1111-111111111111",
  company_id: "c",
  supplier_name: "Orange Slovensko, a.s.",
  supplier_ico: "35697270",
  supplier_ic_dph: "SK2020310578",
  invoice_number: "FA2026/0915",
  variable_symbol: "9150001",
  issue_date: "2026-09-30",
  delivery_date: "2026-09-28",
  due_date: "2026-10-14",
  currency: "EUR",
  payment_method: "prevod",
  amount_without_vat: 100,
  vat_amount: 23,
  amount_total: 123,
  pohoda_predkontacia: "5Fp",
  pohoda_clenenie_dph: "PD",
  category: "software",
};

describe("prijatá faktúra do Pohody", () => {
  it("rozpis DPH zo súm a zo samofaktúry", () => {
    expect(rozpisPrijatej(prijata)).toEqual([{ sadzba: 23, zaklad: 100, dph: 23 }]);
    expect(
      rozpisPrijatej({
        samofakturacia: true,
        items: [
          { name: "a", quantity: 1, unit_price: 100, vat_rate: 23 },
          { name: "b", quantity: 1, unit_price: 50, vat_rate: 5 },
        ],
      }),
    ).toEqual([
      { sadzba: 23, zaklad: 100, dph: 23 },
      { sadzba: 5, zaklad: 50, dph: 2.5 },
    ]);
  });

  it("receivedInvoice s predkontáciou, členením, číslom dodávateľa a dátumom dodania", () => {
    const xml = buildPohodaExpensesXml({ company: firma, doklady: [prijataAkoDoklad(prijata) as any] });
    expect(xml).toContain("<inv:invoiceType>receivedInvoice</inv:invoiceType>");
    expect(xml).toContain("<inv:symVar>9150001</inv:symVar>");
    expect(xml).toContain("<inv:originalDocument>FA2026/0915</inv:originalDocument>");
    expect(xml).toContain("<inv:dateTax>2026-09-28</inv:dateTax>");
    expect(xml).toContain("<inv:dateDue>2026-10-14</inv:dateDue>");
    expect(xml).toContain("<inv:accounting><typ:ids>5Fp</typ:ids></inv:accounting>");
    expect(xml).toContain("<inv:classificationVAT><typ:ids>PD</typ:ids></inv:classificationVAT>");
    expect(xml).toContain("<typ:priceHigh>100.00</typ:priceHigh>");
    const dobropis = buildPohodaExpensesXml({
      company: firma,
      doklady: [
        prijataAkoDoklad({
          ...prijata,
          id: "22222222-2222-2222-2222-222222222222",
          invoice_number: "DOB-7",
          opravuje_cislo: "FA2026/0915",
          amount_without_vat: -10,
          vat_amount: -2.3,
          amount_total: -12.3,
        }) as any,
      ],
    });
    expect(dobropis).toContain("<inv:invoiceType>receivedCreditNotice</inv:invoiceType>");
    if (process.env.ULOZ_XML) writeFileSync(process.env.ULOZ_XML, xml.replace("</dat:dataPack>", "") + dobropis.slice(dobropis.indexOf("<dat:dataPackItem")));
  });
});
