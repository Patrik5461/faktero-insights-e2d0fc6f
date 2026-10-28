import { describe, expect, it } from "vitest";
import { mapToEN16931 } from "../en16931.server";
import { generatePeppolBisXml } from "../xml.server";
import { skontrolujEfakturu, odkazNaPravidlo, PRAVIDLA, NAZVY_KATEGORII } from "./index";
import { ibanPlatny } from "./pravidla";
import { nacitajXml, ChybaXml, cestaUzla } from "./xml-strom";

/* Rovnaké údaje ako v zalohy-xml.server.test.ts — tie overil validátor ePoštáka. */
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

const xmlZ = (args: Partial<Parameters<typeof mapToEN16931>[0]> = {}) =>
  generatePeppolBisXml(
    mapToEN16931({ company: firma, invoice: faktura(), items: [polozka()], ...args }),
  ).xml;

const kody = (xml: string) => skontrolujEfakturu(xml).nalezy.map((n) => n.kod);
const chyby = (xml: string) =>
  skontrolujEfakturu(xml)
    .nalezy.filter((n) => n.zavaznost === "chyba")
    .map((n) => n.kod);

/*
  Varianty so zľavou, prenesením (AE) a neplatiteľom (O) overil aj verejný
  validátor ePoštáka (XSD + EN 16931 + Peppol schematron) 2026-10-28 — 0 chýb.
*/
describe("vlastné XML z generátora prejde", () => {
  it("bežná faktúra 23 % — bez chýb aj varovaní", () => {
    const v = skontrolujEfakturu(xmlZ());
    expect(v.nalezy).toEqual([]);
    expect(v.platny).toBe(true);
    expect(v.suhrn).toMatchObject({
      druh: "Invoice",
      cislo: "FA2026001",
      typ: "380",
      mena: "EUR",
      sumaNaUhradu: 1230,
    });
  });

  it("viac sadzieb, zľava na doklad, zaokrúhlené ceny", () => {
    const xml = xmlZ({
      // Hlavička nesie sumy už po zľave na doklad (riadky ju dostanú rozpočítanú).
      invoice: faktura({ subtotal: 1150.5, vat_total: 230.12, total: 1380.62, discount_total: 50 }),
      items: [
        polozka({
          quantity: 3,
          unit: "hod",
          unit_price: 333.5,
          subtotal: 1000.5,
          vat_amount: 230.12,
          total: 1230.62,
        }),
        polozka({
          position: 2,
          name: "Kniha",
          unit_price: 200,
          subtotal: 200,
          vat_rate: 5,
          vat_amount: 10,
          total: 210,
        }),
      ],
    });
    expect(chyby(xml)).toEqual([]);
  });

  it("dobropis (CreditNote) s pôvodnou faktúrou", () => {
    const xml = xmlZ({
      invoice: faktura({
        type: "credit_note",
        invoice_number: "DB2026001",
        subtotal: -100,
        vat_total: -23,
        total: -123,
      }),
      items: [
        polozka({ quantity: -1, unit_price: 100, subtotal: -100, vat_amount: -23, total: -123 }),
      ],
      povodnaFaktura: { cislo: "FA2026001", vystavena: "2026-10-01" },
    });
    const v = skontrolujEfakturu(xml);
    expect(v.nalezy).toEqual([]);
    expect(v.suhrn?.druh).toBe("CreditNote");
  });

  it("tuzemské prenesenie daňovej povinnosti (AE)", () => {
    const xml = xmlZ({
      invoice: faktura({
        reverse_charge: true,
        reverse_charge_type: "domestic_69",
        vat_total: 0,
        total: 1000,
      }),
      items: [polozka({ vat_amount: 0, total: 1000 })],
    });
    expect(chyby(xml)).toEqual([]);
  });

  it("neplatiteľ DPH (O)", () => {
    const xml = xmlZ({
      company: { ...firma, ic_dph: null, vat_payer: false },
      invoice: faktura({ vat_total: 0, total: 1000 }),
      items: [polozka({ vat_rate: 0, vat_amount: 0, total: 1000 })],
    });
    expect(chyby(xml)).toEqual([]);
  });

  it("zdanená záloha odpočítaná záporným riadkom", () => {
    const xml = xmlZ({
      zalohy: [
        {
          zaloha: "ZF2026001",
          doklad: "DP2026001",
          vs: null,
          suma: 615,
          riadky: [{ sadzba: 23, zaklad: 500, dph: 115 }],
        },
      ] as any,
    });
    expect(chyby(xml)).toEqual([]);
  });
});

describe("pokazené varianty chybu nájdu", () => {
  const dobre = xmlZ();

  it("zlá suma na úhradu → BR-CO-16 s miestom v XML", () => {
    const zle = dobre.replace(/(<cbc:PayableAmount currencyID="EUR">)1230.00/, "$11300.00");
    const v = skontrolujEfakturu(zle);
    const n = v.nalezy.find((x) => x.kod === "BR-CO-16");
    expect(n).toBeTruthy();
    expect(n?.parametre).toMatchObject({ uvedene: "1300.00", vypocitane: "1230.00" });
    expect(n?.cesta).toBe("/Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount");
    expect(zle.split("\n")[n!.riadok! - 1]).toContain("PayableAmount");
    expect(v.platny).toBe(false);
  });

  it("zlá suma riadku → BR-CO-10, BR-S-08 a PEPPOL-EN16931-R120", () => {
    const zle = dobre.replace(
      /(<cac:InvoiceLine>[\s\S]*?<cbc:LineExtensionAmount currencyID="EUR">)1000.00/,
      "$1900.00",
    );
    expect(chyby(zle)).toEqual(
      expect.arrayContaining(["BR-CO-10", "BR-S-08", "PEPPOL-EN16931-R120"]),
    );
  });

  it("zlá DPH v rozpise → BR-CO-14, BR-S-09, BR-CO-17", () => {
    const zle = dobre.replace(
      /(<cac:TaxSubtotal>[\s\S]*?<cbc:TaxAmount currencyID="EUR">)230.00/,
      "$1200.00",
    );
    expect(chyby(zle)).toEqual(expect.arrayContaining(["BR-CO-14", "BR-S-09", "BR-CO-17"]));
  });

  it("chýbajúci kupujúci → BR-07, BR-10; kupujúci bez adresy v sieti → PEPPOL-EN16931-R010", () => {
    const zle = dobre.replace(
      /<cac:AccountingCustomerParty>[\s\S]*?<\/cac:AccountingCustomerParty>\n/,
      "",
    );
    expect(chyby(zle)).toEqual(expect.arrayContaining(["BR-07", "BR-10"]));
    const bezAdresy = dobre.replace(
      / *<cbc:EndpointID schemeID="0245">5843291067<\/cbc:EndpointID>\n/,
      "",
    );
    expect(chyby(bezAdresy)).toContain("PEPPOL-EN16931-R010");
  });

  it("zlá kategória DPH v riadku (Z pri 23 %) → BR-Z-01, BR-Z-05, BR-S-01", () => {
    const zle = dobre.replace(/(<cac:ClassifiedTaxCategory>\s*<cbc:ID>)S(<\/cbc:ID>)/, "$1Z$2");
    expect(chyby(zle)).toEqual(expect.arrayContaining(["BR-Z-01", "BR-Z-05", "BR-S-01"]));
  });

  it("zlá kategória + zlá suma na úhradu — rovnaké kódy ako validátor ePoštáka (overené 2026-10-28)", () => {
    const zle = dobre
      .replace(/(<cac:ClassifiedTaxCategory>\s*<cbc:ID>)S(<\/cbc:ID>)/, "$1Z$2")
      .replace(/(<cbc:PayableAmount currencyID="EUR">)1230.00/, "$11300.00");
    expect([...new Set(chyby(zle))].sort()).toEqual([
      "BR-CO-16",
      "BR-S-01",
      "BR-S-08",
      "BR-Z-01",
      "BR-Z-05",
    ]);
  });

  it("neznáma kategória DPH → BR-CL-18", () => {
    const zle = dobre.replace(/(<cac:ClassifiedTaxCategory>\s*<cbc:ID>)S(<\/cbc:ID>)/, "$1X$2");
    expect(chyby(zle)).toContain("BR-CL-18");
  });

  it("chýbajúce povinné hlavičky → BR-01, BR-02, BR-03, BR-05, PEPPOL R001", () => {
    const zle = dobre
      .replace(/ *<cbc:CustomizationID>.*\n/, "")
      .replace(/ *<cbc:ProfileID>.*\n/, "")
      .replace(/ *<cbc:ID>FA2026001<\/cbc:ID>\n/, "")
      .replace(/ *<cbc:IssueDate>.*\n/, "")
      .replace(/ *<cbc:DocumentCurrencyCode>.*\n/, "");
    expect(chyby(zle)).toEqual(
      expect.arrayContaining(["BR-01", "BR-02", "BR-03", "BR-05", "PEPPOL-EN16931-R001"]),
    );
  });

  it("zlý dátum, mena a krajina", () => {
    const zle = dobre
      .replace("<cbc:IssueDate>2026-10-08", "<cbc:IssueDate>8.10.2026")
      .replace("<cbc:DocumentCurrencyCode>EUR", "<cbc:DocumentCurrencyCode>EURO")
      .replace(
        "<cbc:IdentificationCode>SK</cbc:IdentificationCode>",
        "<cbc:IdentificationCode>SVK</cbc:IdentificationCode>",
      );
    expect(chyby(zle)).toEqual(
      expect.arrayContaining([
        "PEPPOL-EN16931-F001",
        "BR-CL-04",
        "BR-CL-14",
        "PEPPOL-EN16931-R051",
      ]),
    );
  });

  it("Peppol: zlá schéma adresy, 0245 bez 10 číslic, EM e-mail", () => {
    const zle = dobre
      .replace('schemeID="0245">5843291067', 'schemeID="9944">SK5843291067')
      .replace('schemeID="0245">4286179504', 'schemeID="0245">SK4286179504');
    const k = kody(zle);
    expect(k).toEqual(expect.arrayContaining(["FAKTERO-SK-02", "FAKTERO-SK-03"]));
    // Bez Peppol id generátor dáva odberateľovi e-mail (EM) — ten Peppol nepozná.
    const em = xmlZ({
      invoice: faktura({ customer_dic: null, customer_ic_dph: null, customer_email: "a@b.sk" }),
    });
    expect(chyby(em)).toContain("PEPPOL-EN16931-CL008");
  });

  it("dobropis bez pôvodnej faktúry → FAKTERO-SK-07", () => {
    const xml = xmlZ({
      invoice: faktura({ type: "credit_note", subtotal: -100, vat_total: -23, total: -123 }),
      items: [
        polozka({ quantity: -1, unit_price: 100, subtotal: -100, vat_amount: -23, total: -123 }),
      ],
    });
    expect(chyby(xml)).toContain("FAKTERO-SK-07");
  });

  it("neplatná sadzba a IBAN sú len varovania", () => {
    const zle = dobre
      .replace(/<cbc:Percent>23<\/cbc:Percent>/g, "<cbc:Percent>21</cbc:Percent>")
      .replace("SK3112000000198742637541", "SK3112000000198742637542");
    const v = skontrolujEfakturu(zle);
    const varovania = v.nalezy.filter((n) => n.zavaznost === "varovanie").map((n) => n.kod);
    expect(varovania).toEqual(expect.arrayContaining(["FAKTERO-SK-08", "FAKTERO-SK-09"]));
  });

  it("prázdny prvok a viac poznámok", () => {
    const zle = dobre.replace(
      "<cbc:DocumentCurrencyCode>",
      "<cbc:Note></cbc:Note>\n  <cbc:Note>a</cbc:Note>\n  <cbc:Note>b</cbc:Note>\n  <cbc:DocumentCurrencyCode>",
    );
    expect(chyby(zle)).toEqual(
      expect.arrayContaining(["PEPPOL-EN16931-R008", "PEPPOL-EN16931-R002"]),
    );
  });

  it("čiarka v sume → FAKTERO-XML-03", () => {
    const zle = dobre.replace(/(<cbc:PayableAmount currencyID="EUR">)1230.00/, "$11230,00");
    expect(chyby(zle)).toContain("FAKTERO-XML-03");
  });
});

describe("dokument a XML", () => {
  it("nedobre formovaný XML vráti jedinú chybu s miestom", () => {
    const v = skontrolujEfakturu('<?xml version="1.0"?>\n<Invoice>\n  <a></b>\n</Invoice>');
    expect(v.nalezy).toHaveLength(1);
    expect(v.nalezy[0]).toMatchObject({ kod: "FAKTERO-XML-01", riadok: 3 });
  });

  it("iný koreň alebo menný priestor → FAKTERO-XML-02", () => {
    expect(kody("<Order/>")).toEqual(["FAKTERO-XML-02"]);
    expect(kody('<Invoice xmlns="urn:nieco"/>')).toEqual(["FAKTERO-XML-02"]);
  });

  it("DOCTYPE a neznáme entity odmietne", () => {
    expect(() => nacitajXml('<!DOCTYPE x [<!ENTITY a "b">]><x>&a;</x>')).toThrow(ChybaXml);
    expect(() => nacitajXml("<x>&nbsp;</x>")).toThrow(ChybaXml);
    expect(() => nacitajXml("<x>a & b</x>")).toThrow(ChybaXml);
  });

  it("parser: menné priestory, entity, CDATA, cesty", () => {
    const k = nacitajXml(
      '﻿<?xml version="1.0"?><!-- c --><i:Invoice xmlns:i="urn:x" xmlns:b="urn:y"><b:a q="1&amp;2">x&lt;y<![CDATA[<z>]]></b:a><b:a/></i:Invoice>',
    );
    expect(k).toMatchObject({ ns: "urn:x", meno: "Invoice" });
    expect(k.deti[0]).toMatchObject({
      ns: "urn:y",
      meno: "a",
      text: "x<y<z>",
      atributy: { q: "1&2" },
    });
    expect(cestaUzla(k.deti[1])).toBe("/i:Invoice/b:a[2]");
    expect(() => nacitajXml("<a><c:b/></a>")).toThrow(/xmlns:c/);
    expect(() => nacitajXml("<a/><b/>")).toThrow(/jeden koreňový/);
  });
});

describe("zoznam pravidiel", () => {
  it("kódy sú jedinečné a každé pravidlo má popis", () => {
    const k = PRAVIDLA.map((p) => p.kod);
    expect(new Set(k).size).toBe(k.length);
    for (const p of PRAVIDLA) expect(p.popis.length).toBeGreaterThan(10);
    expect(PRAVIDLA.length).toBeGreaterThan(100);
  });

  it("odkazy na docs.peppol.eu", () => {
    expect(odkazNaPravidlo("BR-CO-10")).toBe(
      "https://docs.peppol.eu/poacc/billing/3.0/rules/ubl-tc434/BR-CO-10/",
    );
    expect(odkazNaPravidlo("PEPPOL-EN16931-R001")).toBe(
      "https://docs.peppol.eu/poacc/billing/3.0/rules/ubl-peppol/PEPPOL-EN16931-R001/",
    );
    expect(odkazNaPravidlo("FAKTERO-SK-01")).toBeNull();
  });

  it("IBAN kontrolný súčet", () => {
    expect(ibanPlatny("SK31 1200 0000 1987 4263 7541")).toBe(true);
    expect(ibanPlatny("SK3112000000198742637542")).toBe(false);
  });
});

describe("preklady", () => {
  // Popisy pravidiel idú do t() ako premenná — kontrola kľúčov ich nevidí, tak to stráži tento test.
  const slovniky = import.meta.glob<Record<string, string>>("../../../i18n/{de,cs}/*.ts", {
    eager: true,
    import: "default",
  });
  const jazyk = (j: string) =>
    Object.entries(slovniky)
      .filter(([cesta]) => cesta.includes(`/${j}/`))
      .reduce<Record<string, string>>((a, [, s]) => ({ ...a, ...s }), {});

  it("každý popis pravidla a názov kategórie má nemecký aj český preklad", () => {
    const kluce = [
      ...new Set([
        ...PRAVIDLA.map((p) => p.popis),
        ...Object.values(NAZVY_KATEGORII),
        "Súbor nie je dobre formovaný XML: {chyba}",
        "Koreňový prvok musí byť Invoice alebo CreditNote v mennom priestore UBL 2.1 (je {koren} v „{ns}“).",
      ]),
    ];
    for (const j of ["de", "cs"]) {
      const s = jazyk(j);
      const chybaju = kluce.filter((k) => !s[k]);
      expect(chybaju, j).toEqual([]);
      // Zástupné znaky {x} musia ostať v preklade.
      for (const k of kluce) {
        const z = (t: string) => (t.match(/\{\w+\}/g) ?? []).sort().join();
        expect(z(s[k]), `${j}: ${k}`).toBe(z(k));
      }
    }
  });
});
