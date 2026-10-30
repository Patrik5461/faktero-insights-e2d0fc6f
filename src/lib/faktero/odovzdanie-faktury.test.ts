import { describe, it, expect } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { dokladDoBalika, dovodChyby, fakturyDoBalika } from "./odovzdanie-faktury";
import { EXPORT_STRATEGIES, buildPohodaExpensesXml } from "./export.server";

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

const firma = { ico: "12345678", iban: "SK1234567890123456789012" };
const faktura = {
  invoice_number: "20260001",
  variable_symbol: "20260001",
  type: "regular",
  issue_date: "2026-09-04",
  delivery_date: "2026-09-02",
  due_date: "2026-09-18",
  customer_name: "ACME s.r.o.",
  customer_country: "SK",
  customer_ico: "00151653",
  total: 123,
  currency: "EUR",
};
const polozky = [
  {
    name: "Práce",
    quantity: 1,
    unit: "h",
    unit_price: 100,
    vat_rate: 23,
    subtotal: 100,
    vat_amount: 23,
    total: 123,
  },
];
const zostav = (vyber: any[]) =>
  EXPORT_STRATEGIES.pohoda_xml.build({ company: firma, invoices: vyber });
const cislo = (b: any) => String(b.invoice.invoice_number);

describe("mesačný balík — jedna zlá faktúra ho nezhodí", () => {
  it("jediná faktúra bez kurzu: balík vznikne bez XML faktúr, faktúra je vo vynechaných", async () => {
    // Refurbio 09/10: generátor hodil „nedá vyviezť nič“ a celé odovzdanie spadlo.
    const r = await fakturyDoBalika(
      [{ invoice: { ...faktura, currency: "USD" }, items: polozky }],
      cislo,
      zostav,
    );
    expect(r.content).toBe("");
    expect(r.preskocene).toEqual(["20260001 — faktúra v mene USD nemá kurz"]);
  });

  it("dobrá a zlá faktúra: dobrá ide do XML, zlá do vynechaných", async () => {
    const r = await fakturyDoBalika(
      [
        { invoice: faktura, items: polozky },
        { invoice: { ...faktura, invoice_number: "20260002", currency: "USD" }, items: polozky },
      ],
      cislo,
      zostav,
    );
    const d = parser.parse(r.content).dataPack;
    expect(d.dataPackItem.invoice.invoiceHeader.number.numberRequested).toBe(20260001);
    expect(r.preskocene).toEqual(["20260002 — faktúra v mene USD nemá kurz"]);
  });

  it("faktúra, ktorá zhodí generátor, sa vyčlení a ostatné prejdú", async () => {
    const zostavSChybou = (vyber: string[]) => {
      if (vyber.includes("B")) throw new Error("rozbitá položka");
      return { content: `<xml>${vyber.join(",")}</xml>`, preskocene: [] };
    };
    const r = await fakturyDoBalika(["A", "B", "C"], (x) => x, zostavSChybou);
    expect(r.content).toBe("<xml>A,C</xml>");
    expect(r.preskocene).toEqual(["B — rozbitá položka"]);
  });

  it("bez faktúr sa generátor ani nevolá", async () => {
    const r = await fakturyDoBalika(
      [],
      (x: string) => x,
      () => {
        throw new Error("nemal sa volať");
      },
    );
    expect(r).toEqual({ content: "", preskocene: [] });
  });

  it("dôvod nezdvojí číslo ani predponu generátora", () => {
    expect(
      dovodChyby("X1", new Error("Do Pohody sa nedá vyviezť nič z vybraného: X1 — bez kurzu")),
    ).toBe("X1 — bez kurzu");
    expect(dovodChyby("X1", new Error(""))).toBe("X1 — nepodarilo sa vytvoriť");
  });
});

describe("nespracované bločky do balíka nepatria", () => {
  it("status new vypadne, spracovaný a vyvezený ostanú", () => {
    const doklady = [{ status: "new" }, { status: "processed" }, { status: "exported" }];
    expect(doklady.filter(dokladDoBalika).map((d) => d.status)).toEqual(["processed", "exported"]);
  });
});

describe("prázdny dataPack", () => {
  it("keď neprejde žiadny doklad, XML prijatých dokladov nevznikne", () => {
    // Prázdny dataPack je podľa XSD neplatný — namiesto neho prázdny reťazec.
    expect(buildPohodaExpensesXml({ company: firma, doklady: [] })).toBe("");
  });

  it("s dokladom XML vznikne", () => {
    const xml = buildPohodaExpensesXml({
      company: firma,
      doklady: [
        {
          id: "b1",
          document_number: "1",
          issue_date: "2026-09-05",
          total_amount: 12.3,
          net_amount: 10,
          vat_amount: 2.3,
          currency: "EUR",
          vat_breakdown: [{ sadzba: 23, zaklad: 10, dph: 2.3 }],
        } as any,
      ],
    });
    expect(xml).toContain("<dat:dataPackItem");
  });
});
