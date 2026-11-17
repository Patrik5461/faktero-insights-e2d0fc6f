/*
  Text hlavičky vydanej faktúry v Pohode = text predkontácie z číselníka
  firmy (17. 11. 2026). Vlastný text faktúry ide ako prvá textová položka
  (bez množstva a cien), dlhý sa rozdelí na viac položiek. Bez popisu
  predkontácie alebo bez položiek ostáva text v hlavičke ako doteraz.
*/
import { describe, expect, it } from "vitest";
import { buildPohodaInvoiceXml, popisPredkontacieVydanej, textNaRiadky } from "./export.server";
import { popisyVydanych } from "./export-nastavenia.server";

const XML_LIB = "../../../e2e/lib/xml.mjs";
async function chybaXsd(xml: string): Promise<string | null> {
  const { overXsd, SCHEMY } = await import(/* @vite-ignore */ XML_LIB);
  return overXsd(xml, SCHEMY.pohoda);
}

const firma: any = {
  id: "c1",
  name: "Vzorová firma s.r.o.",
  ico: "36123456",
  dic: "2020123456",
  ic_dph: "SK2020123456",
  vat_payer: true,
  country: "SK",
};
const POPISY = {
  "311000 604000": "Tržby z predaja tovaru",
  "311000 602000": "Tržby za služby",
};
const nastavenia: any = {
  predkontacia: "311000 602000",
  predkontaciaDobropis: "311000 602000",
  clenenieDph: "UD",
  popisyPredkontaciiVydanych: POPISY,
};
const polozka = (o: any = {}) => ({
  id: "i1",
  name: "Konzultácia",
  quantity: 2,
  unit: "hod",
  unit_price: 50,
  vat_rate: 23,
  subtotal: 100,
  vat_amount: 23,
  total: 123,
  ...o,
});
const faktura = (o: any = {}) => ({
  id: "inv-1",
  type: "regular",
  invoice_number: "FA2026001",
  issue_date: "2026-10-10",
  delivery_date: "2026-10-08",
  due_date: "2026-10-24",
  currency: "EUR",
  customer_name: "Odberateľ a.s.",
  customer_country: "SK",
  intro_note: "Fakturujeme vám služby za október",
  subtotal: 100,
  vat_total: 23,
  total: 123,
  ...o,
});

const hlavicka = (xml: string) => xml.match(/<inv:invoiceHeader>[\s\S]*?<\/inv:invoiceHeader>/)![0];
const textHlavicky = (xml: string) => hlavicka(xml).match(/<inv:text>([^<]*)<\/inv:text>/)?.[1] ?? null;
const polozkyXml = (xml: string) =>
  [...xml.matchAll(/<inv:invoiceItem>([\s\S]*?)<\/inv:invoiceItem>/g)].map((m) => m[1]);
const textPolozky = (p: string) => p.match(/<inv:text>([^<]*)<\/inv:text>/)?.[1] ?? null;
const jeTextova = (p: string) => !/<inv:quantity>|<inv:homeCurrency>|<inv:rateVAT>|<inv:accounting>/.test(p);

describe("text hlavičky vydanej faktúry z predkontácie", () => {
  it("hlavička dostane popis predkontácie a text faktúry je prvá textová položka", async () => {
    const xml = buildPohodaInvoiceXml({ company: firma, nastavenia, invoices: [{ invoice: faktura(), items: [polozka()] }] });
    expect(textHlavicky(xml)).toBe("Tržby za služby");
    const pol = polozkyXml(xml);
    expect(pol).toHaveLength(2);
    expect(jeTextova(pol[0])).toBe(true);
    expect(textPolozky(pol[0])).toBe("Fakturujeme vám služby za október");
    expect(textPolozky(pol[1])).toBe("Konzultácia");
    // Súhrn sa nemení — textová položka nemá sumy.
    expect(xml).toContain("<typ:priceHigh>100.00</typ:priceHigh>");
    expect(await chybaXsd(xml)).toBeNull();
  });

  it("bez mapy popisov ostáva text faktúry v hlavičke a textová položka nevznikne", () => {
    const { popisyPredkontaciiVydanych: _, ...bez } = nastavenia;
    const xml = buildPohodaInvoiceXml({ company: firma, nastavenia: bez, invoices: [{ invoice: faktura(), items: [polozka()] }] });
    expect(textHlavicky(xml)).toBe("Fakturujeme vám služby za október");
    expect(polozkyXml(xml)).toHaveLength(1);
  });

  it("kód bez popisu v číselníku = doterajšie správanie", () => {
    const xml = buildPohodaInvoiceXml({
      company: firma,
      nastavenia: { ...nastavenia, predkontacia: "3Fv" },
      invoices: [{ invoice: faktura(), items: [polozka()] }],
    });
    expect(textHlavicky(xml)).toBe("Fakturujeme vám služby za október");
    expect(polozkyXml(xml)).toHaveLength(1);
  });

  it("faktúra bez predkontácie = doterajšie správanie", () => {
    const xml = buildPohodaInvoiceXml({
      company: firma,
      nastavenia: { popisyPredkontaciiVydanych: POPISY },
      invoices: [{ invoice: faktura(), items: [polozka()] }],
    });
    expect(textHlavicky(xml)).toBe("Fakturujeme vám služby za október");
    expect(polozkyXml(xml)).toHaveLength(1);
  });

  it("faktúra bez položiek (len súhrn) nechá text v hlavičke", () => {
    const xml = buildPohodaInvoiceXml({ company: firma, nastavenia, invoices: [{ invoice: faktura(), items: [] }] });
    expect(textHlavicky(xml)).toBe("Fakturujeme vám služby za október");
    expect(polozkyXml(xml)).toHaveLength(0);
  });

  it("vlastná predkontácia faktúry sa preloží na svoj text", () => {
    const xml = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      invoices: [{ invoice: faktura({ pohoda_predkontacia: "311000 604000" }), items: [polozka()] }],
    });
    expect(textHlavicky(xml)).toBe("Tržby z predaja tovaru");
  });

  it("faktúra bez vlastného textu nedostane položku „Faktúra číslo“", () => {
    const xml = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      invoices: [{ invoice: faktura({ intro_note: null, notes: null }), items: [polozka()] }],
    });
    expect(textHlavicky(xml)).toBe("Tržby za služby");
    expect(polozkyXml(xml)).toHaveLength(1);
  });

  it("dlhý text sa rozdelí na viac textových položiek, nič sa neodreže", async () => {
    const dlhy =
      "Fakturujeme vám za poskytnuté služby v mesiaci október 2026 podľa zmluvy o dielo č. 15/2026 " +
      "uzavretej dňa 1. 9. 2026 vrátane dopravy, montáže, zaškolenia obsluhy a odovzdania dokumentácie " +
      "podľa preberacieho protokolu.";
    const xml = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      invoices: [{ invoice: faktura({ intro_note: dlhy }), items: [polozka()] }],
    });
    const pol = polozkyXml(xml);
    const textove = pol.filter(jeTextova);
    expect(textove.length).toBeGreaterThan(1);
    // Textové položky sú pred bežnými.
    expect(pol.slice(0, textove.length).every(jeTextova)).toBe(true);
    const texty = textove.map((p) => textPolozky(p)!);
    expect(texty.every((t) => t.length <= 90)).toBe(true);
    expect(texty.join(" ")).toBe(dlhy);
    expect(await chybaXsd(xml)).toBeNull();
  });

  it("rozúčtovaná faktúra: text kódu z hlavickaRozuctovania (prvá položka)", async () => {
    const xml = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      invoices: [
        {
          invoice: faktura({ subtotal: 200, vat_total: 46, total: 246 }),
          items: [
            polozka({ id: "i1", name: "Tovar", pohoda_predkontacia: "311000 604000" }),
            polozka({ id: "i2", name: "Montáž", pohoda_predkontacia: "311000 602000" }),
          ],
        },
      ],
    });
    expect(hlavicka(xml)).toContain("<typ:ids>311000 604000</typ:ids>");
    expect(textHlavicky(xml)).toBe("Tržby z predaja tovaru");
    const pol = polozkyXml(xml);
    expect(pol).toHaveLength(3);
    expect(textPolozky(pol[0])).toBe("Fakturujeme vám služby za október");
    expect(jeTextova(pol[0])).toBe(true);
    expect(await chybaXsd(xml)).toBeNull();
  });

  it("rozúčtovaná faktúra s vlastnou predkontáciou hlavičky z nastavení", () => {
    const xml = buildPohodaInvoiceXml({
      company: firma,
      nastavenia: { ...nastavenia, predkontaciaRozuctovat: "311000 602000" },
      invoices: [
        {
          invoice: faktura({ subtotal: 200, vat_total: 46, total: 246 }),
          items: [
            polozka({ id: "i1", name: "Tovar", pohoda_predkontacia: "311000 604000" }),
            polozka({ id: "i2", name: "Montáž", pohoda_predkontacia: "311000 602000" }),
          ],
        },
      ],
    });
    expect(textHlavicky(xml)).toBe("Tržby za služby");
  });

  it("rozúčtovanie sumy (riadky) dostane textovú položku pred riadkami", () => {
    const xml = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      invoices: [
        {
          invoice: faktura({
            subtotal: 200,
            vat_total: 46,
            total: 246,
            rozuctovanie: [
              { predkontacia: "311000 604000", clenenie: "UD", sadzba: 23, zaklad: 150, dph: 34.5, text: "Tovar" },
              { predkontacia: "311000 602000", clenenie: "UD", sadzba: 23, zaklad: 50, dph: 11.5, text: "Montáž" },
            ],
          }),
          items: [polozka({ id: "i1" }), polozka({ id: "i2", name: "Montáž" })],
        },
      ],
    });
    expect(textHlavicky(xml)).toBe("Tržby z predaja tovaru");
    const pol = polozkyXml(xml);
    expect(textPolozky(pol[0])).toBe("Fakturujeme vám služby za október");
    expect(textPolozky(pol[1])).toBe("Tovar");
  });

  it("zálohová faktúra (bez predkontácie) sa nemení", () => {
    const xml = buildPohodaInvoiceXml({
      company: firma,
      nastavenia: { ...nastavenia, predkontaciaZaloha: "311000 602000" },
      invoices: [{ invoice: faktura({ type: "proforma" }), items: [polozka()] }],
    });
    expect(textHlavicky(xml)).toBe("Fakturujeme vám služby za október");
    expect(polozkyXml(xml)).toHaveLength(1);
  });
});

describe("pomôcky", () => {
  it("textNaRiadky láme po slovách, drží zalomenia a seká priveľké slovo", () => {
    expect(textNaRiadky("a b c", 3)).toEqual(["a b", "c"]);
    expect(textNaRiadky("prvý\n\n  druhý  riadok ", 90)).toEqual(["prvý", "druhý riadok"]);
    expect(textNaRiadky("x".repeat(200), 90)).toEqual(["x".repeat(90), "x".repeat(90), "x".repeat(20)]);
    expect(textNaRiadky("", 90)).toEqual([]);
  });

  it("popis predkontácie sa skráti na 240 znakov a prázdny kód nič nevráti", () => {
    const n: any = { popisyPredkontaciiVydanych: { A: "y".repeat(300) } };
    expect(popisPredkontacieVydanej(n, "A")).toHaveLength(240);
    expect(popisPredkontacieVydanej(n, "")).toBe("");
    expect(popisPredkontacieVydanej(n, "B")).toBe("");
  });

  it("popisyVydanych uprednostní agendu vydaných faktúr, nákladové vynechá", () => {
    expect(
      popisyVydanych([
        { kod: "1", agenda: "receivedInvoice", popis: "Nákup tovaru" },
        { kod: "1", agenda: "commitment", popis: "Cestná daň" },
        { kod: "1", agenda: "issuedInvoice", popis: "Tržby za vlastné výrobky" },
        { kod: "311000 604000", agenda: "", popis: "Tržby z predaja tovaru" },
        { kod: "311000 604000", agenda: "cashReceived", popis: "Iné" },
        { kod: "5", agenda: "receivedInvoice", popis: "Odpočet zálohy" },
        { kod: "6", agenda: "issuedInvoice", popis: "" },
      ]),
    ).toEqual({ "1": "Tržby za vlastné výrobky", "311000 604000": "Tržby z predaja tovaru" });
  });
});
