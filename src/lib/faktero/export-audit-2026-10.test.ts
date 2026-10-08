import { describe, expect, it } from "vitest";
import { buildMoneyS3Xml, buildOmegaTxt, buildPohodaExpensesXml, EXPORT_STRATEGIES } from "./export.server";
import { buildIsdoc } from "./isdoc-export";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { prijataNaUctovanie, vystavenaNaUctovanie } from "./zauctovanie-export";
import { buildCsvUctovanie } from "./export-csv-uctovanie";

/*
  Chyby z prechodu exportov proti skutočným dokladom (október 2026). Každá
  z nich prešla ticho — súbor vznikol, len v ňom bola zlá daň alebo chýbal
  údaj, ktorý účtovník potrebuje.
*/

const firma = { name: "Test s.r.o.", ico: "12345678", ic_dph: "SK2020123456", country: "SK" };

const faktura = {
  id: "0a0e0000-0000-4000-8000-000000000003",
  invoice_number: "2026003",
  variable_symbol: "2026003",
  type: "regular",
  issue_date: "2026-09-20",
  delivery_date: "2026-09-20",
  due_date: "2026-10-04",
  currency: "EUR",
  customer_name: "Gama s.r.o.",
  customer_ico: "11223344",
  subtotal: 270,
  vat_total: 62.1,
  total: 332.1,
  discount_type: "percent",
  discount_value: 10,
  discount_total: 30,
};
const polozky = [
  { name: "Montáž", quantity: 1, unit: "ks", unit_price: 200, vat_rate: 23, subtotal: 200, vat_amount: 46, total: 246 },
  { name: "Doprava", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 23, subtotal: 100, vat_amount: 23, total: 123 },
];

describe("zľava na celý doklad", () => {
  it("Money S3 zapíše základ a daň po zľave", () => {
    const { xml } = buildMoneyS3Xml({ company: firma, invoices: [{ invoice: faktura, items: polozky }] as any });
    expect(xml).toContain("<Zaklad22>270.00</Zaklad22>");
    expect(xml).toContain("<DPH22>62.10</DPH22>");
    expect(xml).not.toContain("<Zaklad22>300.00</Zaklad22>");
  });

  it("Omega zapíše základ a daň po zľave", () => {
    const txt = buildOmegaTxt({ company: firma, invoices: [{ invoice: faktura, items: polozky }] as any });
    const r01 = txt.split("\r\n").find((r) => r.startsWith("R01\t"))!.split("\t");
    expect(r01[8]).toBe("270,00");
    expect(r01[14]).toBe("62,10");
  });
});

describe("Money S3 — údaje faktúry", () => {
  it("nesie symboly, objednávku, pôvodnú faktúru, druh a poznámku k položke", () => {
    const { xml } = buildMoneyS3Xml({
      company: firma,
      invoices: [
        {
          invoice: {
            ...faktura,
            discount_total: 0,
            type: "debit_note",
            constant_symbol: "0308",
            specific_symbol: "77",
            order_number: "OBJ-55",
            _opravujeCislo: "2026001",
          },
          items: [{ ...polozky[0], description: "Analýza za september" }],
        },
      ] as any,
    });
    expect(xml).toContain("<KonstSym>0308</KonstSym>");
    expect(xml).toContain("<SpecSymbol>77</SpecSymbol>");
    expect(xml).toContain("<CObjednavk>OBJ-55</CObjednavk>");
    expect(xml).toContain("<PuvDoklad>2026001</PuvDoklad>");
    expect(xml).toContain("<Druh>N</Druh>");
    expect(xml).toContain("<Poznamka>Analýza za september</Poznamka>");
  });

  it("dlhé texty oreže na dĺžky zo schémy a celý názov položky dá do poznámky", () => {
    const dlhy = "Prepravné výkony Mercedes Benz Atego - 3 stranný sklápač s HR, ŠPZ AA058HO";
    const { xml } = buildMoneyS3Xml({
      company: firma,
      invoices: [
        {
          invoice: { ...faktura, discount_total: 0, notes: "x".repeat(120), customer_ico: "01-09-863583" },
          items: [{ ...polozky[0], name: dlhy }],
        },
      ] as any,
    });
    const popisy = [...xml.matchAll(/<Popis>([^<]*)<\/Popis>/g)].map((m) => m[1]);
    expect(popisy.every((p) => p.length <= 50)).toBe(true);
    expect(xml).toContain(`<Poznamka>${dlhy}</Poznamka>`);
    // Zahraničné registračné číslo sa do 10 znakov nevojde — vynechá sa.
    expect(xml).toContain("<ICO></ICO>");
  });

  it("vynechá číslo dlhšie ako 10 znakov a faktúru s odpočtom zálohy", () => {
    const { preskocene } = buildMoneyS3Xml({
      company: firma,
      invoices: [
        { invoice: { ...faktura, invoice_number: "NKD202610060847" }, items: polozky },
        { invoice: { ...faktura, advance_amount: 100 }, items: polozky },
      ] as any,
    });
    expect(preskocene).toHaveLength(2);
  });

  it("daňový doklad k prijatej platbe ide ako druh D", () => {
    const { xml } = buildMoneyS3Xml({
      company: firma,
      invoices: [{ invoice: { ...faktura, discount_total: 0, type: "advance_payment", advance_amount: 369 }, items: polozky }] as any,
    });
    expect(xml).toContain("<Druh>D</Druh>");
  });
});

describe("daňový doklad k prijatej platbe v zaúčtovaní", () => {
  const ddp = vystavenaNaUctovanie(
    { ...faktura, discount_total: 0, type: "advance_payment", advance_amount: 369 },
    polozky,
    { predkontacia: "3FV", predkontaciaZaloha: "3ZAL" },
  );

  it("zaplatená suma nie je odpočet a predkontácia je zálohová", () => {
    expect(ddp.odpocetZalohy).toBe(0);
    expect(ddp.dokladKPlatbe).toBe(true);
    expect(ddp.predkontacia).toBe("3ZAL");
  });

  it("súpiska ho pomenuje a vyúčtovacia faktúra nesie odpočet", () => {
    const fin = vystavenaNaUctovanie({ ...faktura, discount_total: 0, advance_amount: 246 }, polozky, {});
    const csv = buildCsvUctovanie({ doklady: [ddp, fin], kody: {} });
    expect(csv).toContain("daňový doklad k platbe");
    expect(csv.split("\r\n")[2].split(";").at(-2)).toBe("246,00");
  });

  it("Omega TXT ho vynechá a povie prečo", () => {
    const preskocene: string[] = [];
    buildOmegaTxt({
      company: firma,
      invoices: [{ invoice: { ...faktura, type: "advance_payment", advance_amount: 369 }, items: polozky }] as any,
      preskocene,
    });
    expect(preskocene[0]).toMatch(/daňový doklad k prijatej platbe/);
  });
});

describe("prijatá faktúra v prenesení daňovej povinnosti (§ 69)", () => {
  // Takto ju uloží formulár: len režim, bez `reverse_charge`, položka so sadzbou.
  const pdp = {
    id: "p1",
    invoice_number: "PDP-15",
    supplier_name: "Stavby PDP s.r.o.",
    issue_date: "2026-09-16",
    delivery_date: "2026-09-16",
    due_date: "2026-09-30",
    amount_without_vat: 1000,
    vat_amount: 0,
    amount_total: 1000,
    currency: "EUR",
    dph_rezim: "samozdanenie",
    reverse_charge: false,
    items: [{ name: "Stavebné práce", quantity: 1, unit_price: 1000, vat_rate: 23, total: 1000 }],
  };

  it("účtovné programy ju dostanú s členením pre prenesenie a KV B.1", () => {
    const d = prijataNaUctovanie(pdp, { clenenieDphPrijata: "PD", clenenieDphPrijataPdp: "PDpdp" });
    expect(d.prenesenieDph).toBe(true);
    expect(d.clenenie).toBe("PDpdp");
    expect(d.kv).toBe("B1");
  });

  it("Pohoda ju dostane v sadzbe s členením pre prenesenie", () => {
    const xml = buildPohodaExpensesXml({
      company: firma,
      doklady: [prijataAkoDoklad(pdp) as any],
      nastavenia: { clenenieDphPrijata: "PD", clenenieDphPdpPrijata: "PDpdp" } as any,
    });
    expect(xml).toContain("<typ:ids>PDpdp</typ:ids>");
    expect(xml).toContain("<typ:ids>B1</typ:ids>");
    expect(xml).not.toContain("<inv:classificationVAT><typ:ids>PD</typ:ids>");
    expect(xml).toContain("<typ:priceHigh>1000.00</typ:priceHigh>");
  });

  it("Pohoda dostane aj účet dodávateľa na príkaz na úhradu", () => {
    const xml = buildPohodaExpensesXml({
      company: firma,
      doklady: [prijataAkoDoklad({ ...pdp, supplier_iban: "SK3302000000000098765432" }) as any],
    });
    expect(xml).toContain("<typ:accountNo>SK3302000000000098765432</typ:accountNo><typ:bankCode>0200</typ:bankCode>");
  });
});

describe("ISDOC", () => {
  const dobropis = {
    ...faktura,
    type: "credit_note",
    discount_total: 0,
    notes: "Vrátenie hodín",
    subtotal: -100,
    vat_total: -23,
    total: -123,
  };
  const riadky = [
    { name: "Dobropis", quantity: -2, unit: "hod", unit_price: 50, vat_rate: 23, subtotal: -100, vat_amount: -23, total: -123 },
  ];
  const xml = buildIsdoc({ invoice: dobropis, items: riadky, company: { ...firma, iban: "" } });

  it("riadok dobropisu má daň s rovnakým znamienkom ako základ", () => {
    expect(xml).toContain("<LineExtensionAmount>100.00</LineExtensionAmount>");
    expect(xml).toContain("<LineExtensionTaxAmount>23.00</LineExtensionTaxAmount>");
    expect(xml).toContain("<LineExtensionAmountTaxInclusive>123.00</LineExtensionAmountTaxInclusive>");
  });

  it("nesie poznámku faktúry", () => {
    expect(xml).toContain("<Note>Vrátenie hodín</Note>");
  });

  it("daňový doklad k prijatej platbe má typ 5 a v dávke nevypadne", async () => {
    const r = await EXPORT_STRATEGIES.isdoc_zip.build({
      company: firma as any,
      invoices: [
        { invoice: { ...faktura, discount_total: 0, type: "advance_payment", advance_amount: 369 }, items: polozky },
        { invoice: { ...faktura, discount_total: 0, invoice_number: "2026004", advance_amount: 100 }, items: polozky },
      ] as any,
    });
    expect(r.preskocene).toEqual([expect.stringMatching(/^2026004 — /)]);
    expect(buildIsdoc({ invoice: { ...faktura, type: "advance_payment" }, items: polozky, company: firma })).toContain(
      "<DocumentType>5</DocumentType>",
    );
  });
});
