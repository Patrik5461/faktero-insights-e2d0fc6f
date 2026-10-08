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
    discount_total: 0,
    notes: "Ďakujeme; platba prevodom",
  },
  items: [
    {
      name: "Práce",
      quantity: 1,
      unit: "ks",
      unit_price: 100,
      vat_rate: 23,
      subtotal: 100,
      vat_amount: 23,
      total: 123,
    },
    {
      name: "Materiál",
      quantity: 2,
      unit: "ks",
      unit_price: 25,
      vat_rate: 5,
      subtotal: 50,
      vat_amount: 2.5,
      total: 52.5,
    },
    {
      name: "Oslobodené",
      quantity: 1,
      unit: "ks",
      unit_price: 20,
      vat_rate: 0,
      subtotal: 20,
      vat_amount: 0,
      total: 20,
    },
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

const dobropis = {
  invoice: {
    ...faktura.invoice,
    invoice_number: "20260009",
    type: "credit_note",
    subtotal: 100,
    vat_total: 23,
    total: 123,
    discount_total: 0,
  },
  items: [
    {
      name: "Vrátené práce",
      quantity: 1,
      unit: "hod",
      unit_price: 100,
      vat_rate: 23,
      subtotal: 100,
      vat_amount: 23,
      total: 123,
    },
  ],
};

const vCudzejMene = {
  invoice: {
    ...faktura.invoice,
    invoice_number: "20260010",
    currency: "CZK",
    exchange_rate: 25.3,
    subtotal: 10000,
    vat_total: 0,
    total: 10000,
    total_eur: 395.26,
    discount_total: 0,
  },
  items: [
    {
      name: "Vývoj",
      quantity: 100,
      unit: "hod",
      unit_price: 100,
      vat_rate: 0,
      subtotal: 10000,
      vat_amount: 0,
      total: 10000,
    },
  ],
};

describe("ABRA Flexi XML", () => {
  const xml = buildFlexiXml({ invoices: [faktura] }).xml;

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
      invoices: [{ ...faktura, invoice: { ...faktura.invoice, customer_name: "A & B <s.r.o.>" } }],
    }).xml;
    expect(s).toContain("A &amp; B &lt;s.r.o.&gt;");
    expect(s).not.toContain("<s.r.o.>");
  });
});

describe("dobropis a cudzia mena", () => {
  it("súpiska dá dobropisu záporné sumy, hoci sú v databáze kladné", () => {
    const r = buildUniverzalCsv({ invoices: [dobropis] })
      .trim()
      .split("\r\n")[1]
      .split(";");
    expect(r).toContain("Dobropis");
    expect(r).toContain("-100,00");
    expect(r).toContain("-23,00");
    expect(r).toContain("-123,00");
  });

  it("súpiska pridá kurz a sumu v eurách, len keď je v dávke cudzia mena", () => {
    const sCudzou = buildUniverzalCsv({ invoices: [faktura, vCudzejMene] })
      .trim()
      .split("\r\n");
    expect(sCudzou[0]).toContain("Kurz");
    expect(sCudzou[0]).toContain("Celkom v EUR");
    expect(sCudzou[2]).toContain("25,30");
    expect(sCudzou[2]).toContain("395,26");
    /* Pri eurovej dávke by stĺpce navyše len zavadzali. */
    expect(buildUniverzalCsv({ invoices: [faktura] }).split("\r\n")[0]).not.toContain("Kurz");
  });

  it("Flexi pošle dobropis ako DOBROPIS a so zápornými sumami", () => {
    const { xml, preskocene } = buildFlexiXml({ invoices: [dobropis] });
    expect(xml).toContain("<typDokl>code:DOBROPIS</typDokl>");
    expect(xml).toContain("<sumCelkem>-123.00</sumCelkem>");
    expect(xml).toContain("<mnozMj>-1.00</mnozMj>");
    expect(preskocene).toEqual([]);
  });

  it("Flexi vynechá zálohovú faktúru a doklad v cudzej mene bez kurzu, s kurzom ho zapíše", () => {
    const zaloha = {
      ...faktura,
      invoice: { ...faktura.invoice, invoice_number: "ZF1", type: "proforma" },
    };
    const bezKurzu = { ...vCudzejMene, invoice: { ...vCudzejMene.invoice, invoice_number: "BK1", exchange_rate: null } };
    const { xml, preskocene } = buildFlexiXml({ invoices: [faktura, zaloha, vCudzejMene, bezKurzu as any] });
    expect(xml.match(/<faktura-vydana>/g)).toHaveLength(2);
    expect(preskocene).toHaveLength(2);
    expect(preskocene[0]).toContain("ZF1");
    expect(preskocene[1]).toMatch(/BK1 .*CZK/);
    // 10 000 Kč pri kurze 25,3: v eurách 395,26, v korunách v poliach *Men, kurz za 100 Kč.
    expect(xml).toContain("<sumCelkem>395.26</sumCelkem>");
    expect(xml).toContain("<sumCelkemMen>10000.00</sumCelkemMen>");
    expect(xml).toContain("<kurzMnozstvi>100</kurzMnozstvi>");
  });
});
