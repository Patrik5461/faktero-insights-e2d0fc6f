/*
  Export do Pohody podľa oficiálnej dokumentácie XML komunikácie Stormware.

  Zdroje (každý test odkazuje na to, z čoho vychádza):
  - schémy s popisom prvkov: https://www.stormware.cz/xml/schema/version_2/
    (invoice.xsd, intDoc.xsd, voucher.xsd, type.xsd) — kópie v `schemy/pohoda/`;
  - zoznam dokladov a vzory pre SK verziu:
    https://www.stormware.sk/pohoda/xml/dokladyimport/;
  - príručka POHODA SK (Kontrolný výkaz DPH):
    https://www.stormware.sk/prirucka-pohoda-online/Dan_z_pridanej_hodnoty/Kontrolny_vykaz_DPH/.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import {
  buildPohodaExpensesXml,
  buildPohodaInvoiceXml,
  buildPohodaStornaXml,
  kurzPrePohodu,
} from "./export.server";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { kvPrijatehoPrePohodu, kvVystavenehoPrePohodu } from "./pohoda-kv";

xmlRegisterFsInputProviders();

const SCHEMY: Record<string, string> = {
  inv: "invoice.xsd",
  int: "intDoc.xsd",
  vch: "voucher.xsd",
};
const validatory = new Map<string, XsdValidator>();
function chybySchemy(xml: string): string[] {
  const ns = [
    ...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`)),
  ];
  const chyby: string[] = [];
  for (const m of xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)) {
    const vnutro = m[1].trim();
    const prefix = /^<(\w+):/.exec(vnutro)?.[1] ?? "";
    let v = validatory.get(prefix);
    if (!v) {
      const url = new URL(`./schemy/pohoda/${SCHEMY[prefix]}`, import.meta.url);
      v = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
      validatory.set(prefix, v);
    }
    const doc = XmlDocument.fromString(vnutro.replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
    try {
      v.validate(doc);
    } catch (e: any) {
      chyby.push(
        `${prefix}: ${String(e?.message ?? e)} ${JSON.stringify(e?.details ?? "").slice(0, 300)}`,
      );
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}

const firmaSk = { ico: "56607016", country: "SK", default_currency: "EUR" };
const firmaCz = { ico: "12345678", country: "CZ", default_currency: "CZK" };

const faktura = (o: Record<string, unknown> = {}) => ({
  id: "f1",
  invoice_number: "FA2026001",
  type: "regular",
  issue_date: "2026-10-10",
  delivery_date: "2026-10-08",
  due_date: "2026-10-24",
  currency: "EUR",
  total: 123,
  customer_name: "Odberateľ s.r.o.",
  customer_ic_dph: "SK2020202020",
  ...o,
});
const polozka = (o: Record<string, unknown> = {}) => ({
  name: "Služba",
  quantity: 1,
  unit_price: 100,
  subtotal: 100,
  vat_rate: 23,
  vat_amount: 23,
  total: 123,
  ...o,
});
const hodnota = (xml: string, el: string) =>
  new RegExp(`<${el}>([^<]*)</${el}>`).exec(xml)?.[1] ?? null;
const kvHlavicky = (xml: string) =>
  /Header>[\s\S]*?<\w+:classificationKVDPH><typ:ids>([^<]+)<\/typ:ids>[\s\S]*?<\/\w+:\w+Header>/.exec(
    xml,
  )?.[1] ?? null;

describe("kurz cudzej meny (type.xsd typeCurrencyForeign, vzory Stormware)", () => {
  // SK vzor invoice_05_v2.0_CM.xml: CZK, <typ:rate>25.346</typ:rate>, <typ:amount>1</typ:amount>
  // — SK Pohoda má kurz ECB, koľko cudzej meny za 1 €.
  it("SK Pohoda dostane kurz ECB (cudzia mena za 1 €), množstvo 1", () => {
    expect(kurzPrePohodu(25.346, "SK")).toEqual({ rate: 25.346, amount: 1 });
    expect(kurzPrePohodu(392.5, "SK")).toEqual({ rate: 392.5, amount: 1 });
  });
  // CZ vzor invoice_03_v2.0.xml: EUR <typ:rate>21.232</typ:rate> (Kč za 1 €), kurz ČNB.
  it("CZ Pohoda ostáva v zápise ČNB (koruny za množstvo cudzej meny)", () => {
    expect(kurzPrePohodu(24.365, "CZ")).toEqual({ rate: 24.365, amount: 1 });
  });
  it("faktúra SK firmy v CZK nesie kurz ECB a je platná podľa schémy", () => {
    const xml = buildPohodaInvoiceXml({
      company: firmaSk,
      invoices: [
        {
          invoice: faktura({ currency: "CZK", exchange_rate: 24.5, total: 1230 }),
          items: [polozka({ unit_price: 1000, subtotal: 1000, vat_amount: 230, total: 1230 })],
        },
      ],
    });
    expect(hodnota(xml, "typ:rate")).toBe("24.5");
    expect(hodnota(xml, "typ:amount")).toBe("1");
    expect(chybySchemy(xml)).toEqual([]);
  });
});

describe("dátum uplatnenia DPH dobropisu (invoice.xsd dateApplicationVAT)", () => {
  // „Datum pro zařazení dobropisu, resp. opravného daňového dokladu do přiznání k DPH
  // a uplatnění odpočtu DPH.“
  it("vydaný dobropis — deň vyhotovenia", () => {
    const xml = buildPohodaInvoiceXml({
      company: firmaSk,
      invoices: [
        {
          invoice: faktura({ type: "credit_note", total: -123, _opravujeCislo: "FA2026000" }),
          items: [polozka({ quantity: -1, subtotal: -100, vat_amount: -23, total: -123 })],
        },
      ],
    });
    expect(hodnota(xml, "inv:invoiceType")).toBe("issuedCreditNotice");
    expect(hodnota(xml, "inv:dateApplicationVAT")).toBe("2026-10-10");
    expect(chybySchemy(xml)).toEqual([]);
  });
  it("bežná faktúra ho nemá", () => {
    const xml = buildPohodaInvoiceXml({
      company: firmaSk,
      invoices: [{ invoice: faktura(), items: [polozka()] }],
    });
    expect(xml).not.toContain("dateApplicationVAT");
  });
  it("prijatý dobropis — deň, keď ho firma dostala", () => {
    const d = prijataAkoDoklad({
      id: "p1",
      supplier_name: "Dodávateľ",
      supplier_ic_dph: "SK2021111111",
      invoice_number: "D-5",
      opravuje_cislo: "F-4",
      issue_date: "2026-10-01",
      received_date: "2026-10-05",
      amount_without_vat: -100,
      vat_amount: -23,
      amount_total: -123,
      currency: "EUR",
    });
    const xml = buildPohodaExpensesXml({ company: firmaSk, doklady: [d] } as any);
    expect(hodnota(xml, "inv:invoiceType")).toBe("receivedCreditNotice");
    expect(hodnota(xml, "inv:dateApplicationVAT")).toBe("2026-10-05");
    expect(kvHlavicky(xml)).toBe("C2");
    expect(chybySchemy(xml)).toEqual([]);
  });
});

describe("prenesenie na položke (invoice.xsd PDP, CodePDP)", () => {
  // PDP: „Příznak Přenesení daňové povinnosti (pouze pro Vydané faktury, Vydané zálohové
  // faktury a Ostatní pohledávky)“; CodePDP: „Kód zboží (… v SK verzi)“ — KV A.2, stĺpec TK.
  it("tuzemské prenesenie nesie príznak a 4-miestny kód tovaru", () => {
    const xml = buildPohodaInvoiceXml({
      company: firmaSk,
      invoices: [
        {
          invoice: faktura({
            reverse_charge: true,
            reverse_charge_type: "domestic_69",
            total: 100,
          }),
          items: [polozka({ vat_rate: 0, vat_amount: 0, total: 100, colny_kod: "72083900" })],
        },
      ],
    });
    expect(hodnota(xml, "inv:PDP")).toBe("true");
    expect(hodnota(xml, "inv:CodePDP")).toBe("7208");
    expect(kvHlavicky(xml)).toBe("A2");
    expect(chybySchemy(xml)).toEqual([]);
  });
  it("stavebné práce bez kódu tovaru — len príznak", () => {
    const xml = buildPohodaInvoiceXml({
      company: firmaSk,
      invoices: [
        {
          invoice: faktura({
            reverse_charge: true,
            reverse_charge_type: "domestic_69",
            total: 100,
          }),
          items: [polozka({ vat_rate: 0, vat_amount: 0, total: 100 })],
        },
      ],
    });
    expect(hodnota(xml, "inv:PDP")).toBe("true");
    expect(xml).not.toContain("CodePDP");
  });
  it("dodanie do EÚ príznak tuzemského prenesenia nedostane", () => {
    const xml = buildPohodaInvoiceXml({
      company: firmaSk,
      invoices: [
        {
          invoice: faktura({
            reverse_charge: true,
            reverse_charge_type: "eu_b2b",
            customer_country: "DE",
            total: 100,
          }),
          items: [polozka({ vat_rate: 0, vat_amount: 0, total: 100 })],
        },
      ],
    });
    expect(xml).not.toContain("<inv:PDP>");
    expect(kvHlavicky(xml)).toBeNull();
  });
});

describe("členenie KV DPH (príručka SK: prázdne pole = doklad do KV nevstúpi)", () => {
  it("vystavené: A.1 platiteľovi, D.2 ostatným, C.1 dobropis, záloha nič", () => {
    const zaklad = { cz: false, maDph: true };
    expect(
      kvVystavenehoPrePohodu({ ...zaklad, typ: "regular", icDphOdberatela: "SK2020202020" }),
    ).toBe("A1");
    expect(kvVystavenehoPrePohodu({ ...zaklad, typ: "regular", icDphOdberatela: "" })).toBe("D2");
    expect(kvVystavenehoPrePohodu({ ...zaklad, typ: "credit_note" })).toBe("C1");
    // Dobropis k tuzemskému preneseniu ide tiež do C.1 (KV metodický pokyn, časť C.1).
    expect(
      kvVystavenehoPrePohodu({
        ...zaklad,
        typ: "credit_note",
        maDph: false,
        tuzemskePdp: true,
        reverseCharge: true,
      }),
    ).toBe("C1");
    expect(kvVystavenehoPrePohodu({ ...zaklad, typ: "proforma" })).toBe("");
    expect(kvVystavenehoPrePohodu({ ...zaklad, typ: "regular", reverseCharge: true })).toBe("");
    expect(
      kvVystavenehoPrePohodu({ ...zaklad, typ: "regular", tuzemskePdp: true, reverseCharge: true }),
    ).toBe("A2");
    // Ručne zvolené a predvolené firmy majú prednosť; X = nezahŕňať.
    expect(kvVystavenehoPrePohodu({ ...zaklad, typ: "regular", kvDokladu: "X" })).toBe("");
    expect(
      kvVystavenehoPrePohodu({
        ...zaklad,
        typ: "regular",
        predvolene: "D2",
        icDphOdberatela: "SK1",
      }),
    ).toBe("D2");
    // Česká Pohoda element nemá.
    expect(
      kvVystavenehoPrePohodu({ ...zaklad, cz: true, typ: "regular", icDphOdberatela: "CZ1" }),
    ).toBe("");
  });
  it("prijaté: B.2 faktúra, B.3 bloček, C.2 dobropis, B.1 prenesenie, bez odpočtu nič", () => {
    const zaklad = { cz: false, maDph: true, blocek: false, dobropis: false, pdp: false };
    expect(kvPrijatehoPrePohodu(zaklad)).toBe("B2");
    expect(kvPrijatehoPrePohodu({ ...zaklad, blocek: true })).toBe("B3");
    expect(kvPrijatehoPrePohodu({ ...zaklad, dobropis: true })).toBe("C2");
    expect(kvPrijatehoPrePohodu({ ...zaklad, pdp: true, maDph: false })).toBe("B1");
    expect(kvPrijatehoPrePohodu({ ...zaklad, odpocet: false })).toBe("");
    expect(kvPrijatehoPrePohodu({ ...zaklad, rezim: "dovoz" })).toBe("");
    expect(kvPrijatehoPrePohodu({ ...zaklad, maDph: false })).toBe("");
    expect(kvPrijatehoPrePohodu({ ...zaklad, clenenieDph: "PN" })).toBe("");
    expect(kvPrijatehoPrePohodu({ ...zaklad, clenenieDph: "PN", kvDokladu: "B2" })).toBe("B2");
  });
  it("bežná vydaná faktúra ide s KV aj bez nastavení firmy", () => {
    const xml = buildPohodaInvoiceXml({
      company: firmaSk,
      invoices: [{ invoice: faktura(), items: [polozka()] }],
    });
    expect(kvHlavicky(xml)).toBe("A1");
    const cz = buildPohodaInvoiceXml({
      company: firmaCz,
      invoices: [
        {
          invoice: faktura({ currency: "CZK" }),
          items: [polozka({ vat_rate: 21, vat_amount: 21, total: 121 })],
        },
      ],
    });
    expect(cz).not.toContain("classificationKVDPH");
  });
  it("prijatá faktúra s DPH ide s B.2 a je platná podľa schémy", () => {
    const d = prijataAkoDoklad({
      id: "p2",
      supplier_name: "Dodávateľ",
      supplier_ic_dph: "SK2021111111",
      invoice_number: "F-9",
      issue_date: "2026-10-01",
      amount_without_vat: 100,
      vat_amount: 23,
      amount_total: 123,
      currency: "EUR",
    });
    const xml = buildPohodaExpensesXml({ company: firmaSk, doklady: [d] } as any);
    expect(kvHlavicky(xml)).toBe("B2");
    expect(chybySchemy(xml)).toEqual([]);
  });
  it("rozúčtovaný bloček nesie KV pri položkách (hlavička „Rozúčtovať“ ho nemá)", () => {
    const xml = buildPohodaExpensesXml({
      company: firmaSk,
      doklady: [
        {
          id: "b1",
          supplier_name: "OMV",
          document_number: "11665",
          issue_date: "2026-10-26",
          total_amount: 123,
          vat_breakdown: [{ sadzba: 23, zaklad: 100, dph: 23 }],
          rozuctovanie: [
            {
              predkontacia: "501100",
              clenenie: "PD",
              zaklad: 50,
              dph: 11.5,
              sadzba: 23,
              text: "50 %",
            },
            {
              predkontacia: "501999",
              clenenie: "PN",
              zaklad: 50,
              dph: 11.5,
              sadzba: 23,
              text: "50 %",
            },
          ],
        },
      ],
      nastavenia: {},
    } as any);
    const kody = [...xml.matchAll(/Item>[\s\S]*?<\/\w+:\w+Item>/g)].map(
      (m) => /classificationKVDPH><typ:ids>([^<]+)</.exec(m[0])?.[1] ?? null,
    );
    // Časť s členením „nezahrnovať do priznania“ (PN) do KV nepatrí.
    expect(kody).toEqual(["B3", null]);
  });
});

describe("storno (vzor invoiceStorno.xml na stormware.sk)", () => {
  // Vzor má pri cancelDocument aj invoiceHeader s invoiceType a textom — vydaná
  // zálohová faktúra je v Pohode iná agenda než vydaná faktúra.
  it("nesie typ dokladu, aby ho Pohoda hľadala v správnej agende", () => {
    const xml = buildPohodaStornaXml({
      company: firmaSk,
      storna: [
        { id: "a", cislo: "ZF2026001", typ: "proforma" },
        { id: "b", cislo: "FA2026002", typ: "regular" },
      ],
    });
    expect(xml).toContain("<inv:invoiceType>issuedAdvanceInvoice</inv:invoiceType>");
    expect(xml).toContain("<inv:invoiceType>issuedInvoice</inv:invoiceType>");
    expect(xml).toContain("<inv:text>Storno dokladu č. ZF2026001</inv:text>");
    expect(chybySchemy(xml)).toEqual([]);
  });
});
