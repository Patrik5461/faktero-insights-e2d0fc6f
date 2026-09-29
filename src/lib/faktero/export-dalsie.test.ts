import { describe, it, expect } from "vitest";
import { buildFlexiXml, buildUniverzalCsv } from "./export-dalsie";

const faktura = {
  invoice: {
    invoice_number: "20260001",
    type: "regular",
    issue_date: "2026-09-29",
    delivery_date: "2026-09-28",
    due_date: "2026-10-13",
    currency: "EUR",
    variable_symbol: "20260001",
    payment_method: "bank_transfer",
    customer_name: "Ukážkový odberateľ s.r.o.",
    customer_ico: "44444444",
    customer_dic: "2022334455",
    customer_ic_dph: "SK2022334455",
    customer_street: "Hlavná 12",
    customer_city: "Trnava",
    customer_zip: "917 01",
    customer_country: "SK",
    subtotal: 150,
    vat_total: 29.5,
    total: 179.5,
    discount_total: 10,
    notes: "Ďakujeme; platba prevodom",
  },
  items: [
    { name: "Práce", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 23, subtotal: 100, vat_amount: 23, total: 123 },
    { name: "Materiál", quantity: 2, unit: "ks", unit_price: 25, vat_rate: 5, subtotal: 50, vat_amount: 2.5, total: 52.5 },
    { name: "Oslobodené", quantity: 1, unit: "ks", unit_price: 20, vat_rate: 0, subtotal: 20, vat_amount: 0, total: 20 },
  ],
};

describe("univerzálna súpiska v CSV", () => {
  const csv = buildUniverzalCsv({ invoices: [faktura] });
  const riadky = csv.trim().split("\r\n");

  it("má hlavičku so stĺpcami sadzieb, ktoré sa naozaj vyskytli", () => {
    expect(riadky[0]).toContain("Základ 23 %;DPH 23 %");
    expect(riadky[0]).toContain("Základ 5 %;DPH 5 %");
    expect(riadky[0]).not.toContain("Základ 19 %");
  });

  it("rozpíše sumy po sadzbách a použije slovenskú čiarku", () => {
    const b = riadky[1].split(";");
    expect(b).toContain("100,00"); // základ 23 %
    expect(b).toContain("23,00"); // daň 23 %
    expect(b).toContain("50,00"); // základ 5 %
    expect(b).toContain("2,50");
    expect(b).toContain("20,00"); // nulová sadzba
    expect(b).toContain("179,50"); // celkom
  });

  it("text s bodkočiarkou zabalí do úvodzoviek, nech nerozbije stĺpce", () => {
    expect(riadky[1]).toContain('"Ďakujeme; platba prevodom"');
    /* Počítame polia ako CSV, nie naivným splitom — bodkočiarka v úvodzovkách stĺpec nerozdeľuje. */
    const poli = (r: string) => r.match(/("([^"]|"")*"|[^;]*)(;|$)/g)!.length - 1;
    expect(poli(riadky[1])).toBe(poli(riadky[0]));
  });

  it("typ dokladu aj formu úhrady píše po slovensky", () => {
    expect(riadky[1]).toContain("Faktúra");
    expect(riadky[1]).toContain("Prevod");
  });

  it("prázdna dávka dá aspoň hlavičku", () => {
    expect(buildUniverzalCsv({ invoices: [] }).trim().split("\r\n")).toHaveLength(1);
  });
});

describe("ABRA Flexi XML", () => {
  const xml = buildFlexiXml({ invoices: [faktura] });

  it("je obalené vo winstrome a nesie doklad s položkami", () => {
    expect(xml).toContain('<winstrom version="1.0">');
    expect(xml).toContain("<faktura-vydana>");
    expect(xml).toContain("<kod>20260001</kod>");
    expect(xml.match(/<faktura-vydana-polozka>/g)).toHaveLength(3);
  });

  it("sadzby prekladá na priehradky Flexi", () => {
    expect(xml).toContain("typSzbDph.dphZakl"); // 23 %
    expect(xml).toContain("typSzbDph.dphSniz"); // 5 %
    expect(xml).toContain("typSzbDph.dphOsv"); // 0 %
  });

  it("súčty berie z hlavičky, aby sedeli so zľavou", () => {
    expect(xml).toContain("<sumZklCelkem>150.00</sumZklCelkem>");
    expect(xml).toContain("<sumCelkem>179.50</sumCelkem>");
  });

  it("uteká znaky, ktoré by rozbili XML", () => {
    const s = buildFlexiXml({
      invoices: [{ ...faktura, invoice: { ...faktura.invoice, customer_name: 'A & B <s.r.o.>' } }],
    });
    expect(s).toContain("A &amp; B &lt;s.r.o.&gt;");
    expect(s).not.toContain("<s.r.o.>");
  });
});
