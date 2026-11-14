/*
  Regresné testy k auditu exportov do POHODY (14. 11. 2026) — členenie DPH
  a režimy: K1 (OSS), V2 (dodanie do EÚ, vývoz), K4 (prijaté prenesenie
  v cudzej mene), V4 (dátum dane pri samozdanení), V5 (bez nároku na
  odpočet), V6 (nadobudnutie tovaru z EÚ).

  Kódy členenia sú zo štandardného číselníka POHODY SK
  (predkontacie-systemove.ts, `listClassificationVATRequest`):
  UN „Nezahrňovať do priznania“, UDdodEU (U04), UDdod3 (U07), UNodpS (U08),
  UDzahrSl (U22), PDnadEU (P04), PB (P03). Každé XML ide proti XSD Stormware
  (e2e/schemy/pohoda/data.xsd).
*/
import { describe, expect, it } from "vitest";
import { buildPohodaExpensesXml, buildPohodaInvoiceXml } from "./export.server";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import {
  chybaClenenieMimoTuzemska,
  clenenieMimoTuzemska,
  navrhClenenieVystavenej,
  resolveVatClassification,
} from "./clenenie-vystavenej";
import { clenenieRezimuPrijatej } from "./clenenie-prijatych";
import { datumyPrijateho } from "./export-nastavenia";
import { prekazkaVydanej } from "./pohoda-kontrola";

const XML_LIB = "../../../e2e/lib/xml.mjs";
async function overXsd(xml: string): Promise<string | null> {
  const { overXsd, SCHEMY } = await import(/* @vite-ignore */ XML_LIB);
  return overXsd(xml, SCHEMY.pohoda);
}

const firmaSK: any = {
  id: "c1",
  name: "Vzorová firma s.r.o.",
  ico: "36123456",
  dic: "2020123456",
  ic_dph: "SK2020123456",
  vat_payer: true,
  country: "SK",
};

// Firma s predvolenými kódmi (Predkontácie → Predvolené) — práve tie robili K1/V2/V5/V6.
const nastavenia: any = {
  predkontacia: "3Fv",
  clenenieDph: "UD",
  clenenieDphPdp: "UDpdp",
  predkontaciaPrijata: "1Fp",
  clenenieDphPrijata: "PD",
  clenenieDphPdpPrijata: "PDpdp",
};

const polozka = (o: any = {}) => ({
  name: "Tovar",
  quantity: 1,
  unit: "ks",
  unit_price: 100,
  vat_rate: 0,
  subtotal: 100,
  vat_amount: 0,
  total: 100,
  ...o,
});

const faktura = (o: any = {}) => ({
  id: "inv-1",
  type: "regular",
  invoice_number: "FA2026001",
  variable_symbol: "2026001",
  issue_date: "2026-10-10",
  delivery_date: "2026-10-08",
  due_date: "2026-10-24",
  currency: "EUR",
  customer_name: "Kunde GmbH",
  customer_country: "DE",
  customer_ic_dph: "DE123456789",
  payment_method: "bank_transfer",
  subtotal: 100,
  vat_total: 0,
  total: 100,
  ...o,
});

const clenenia = (xml: string) =>
  [...xml.matchAll(/<inv:classificationVAT><typ:ids>([^<]*)<\/typ:ids>/g)].map((m) => m[1]);
const kv = (xml: string) => [...xml.matchAll(/<inv:classificationKVDPH><typ:ids>([^<]*)<\/typ:ids>/g)].map((m) => m[1]);

describe("K1 — predaj cez OSS nejde do slovenského priznania ani KV", () => {
  const oss = faktura({
    oss: true,
    oss_country: "DE",
    customer_ic_dph: null,
    customer_name: "Max Mustermann",
    subtotal: 100,
    vat_total: 19,
    total: 119,
  });
  const items = [polozka({ vat_rate: 19, vat_amount: 19, total: 119 })];

  it("export bez uloženého členenia: UN, bez KV, MOSS ostáva; XML podľa XSD", async () => {
    const x = buildPohodaInvoiceXml({ company: firmaSK, nastavenia, invoices: [{ invoice: oss, items }] });
    expect(await overXsd(x)).toBeNull();
    expect(new Set(clenenia(x))).toEqual(new Set(["UN"]));
    expect(kv(x)).toEqual([]);
    expect(x).toContain("<inv:MOSS><typ:ids>DE</typ:ids></inv:MOSS>");
  });

  it("návrh pri uložení: predvolené UD firmy OSS nedostane", () => {
    const r = resolveVatClassification(
      { ...firmaSK, pohoda_clenenie_dph: "UD", kv_clenenie_faktura: "D2" },
      { ...oss, customer_country: "DE" },
    );
    expect(r.pohoda_clenenie_dph).toBe("UN");
    expect(r.kv_clenenie).toBeNull();
    // Ani pravidlo „všetky vystavené → UD / A1“.
    const p = resolveVatClassification(firmaSK, oss, { pravidlo: { clenenie_dph: "UD", kv_clenenie: "D2" } });
    expect([p.pohoda_clenenie_dph, p.kv_clenenie]).toEqual(["UN", null]);
    expect(
      navrhClenenieVystavenej({
        predvoleneFirmy: "UD",
        platitel: true,
        krajinaFirmy: "SK",
        ciselnik: [],
        doklad: { dph: 19, ossKrajina: "DE" },
      })?.kod,
    ).toBe("UN");
  });

  it("kontrola zastaví OSS s uloženým tuzemským členením alebo KV", () => {
    expect(chybaClenenieMimoTuzemska({ ...oss, pohoda_clenenie_dph: "UD" }, "SK")).toMatch(/OSS/);
    expect(chybaClenenieMimoTuzemska({ ...oss, kv_clenenie: "D2" }, "SK")).toMatch(/KV/);
    expect(chybaClenenieMimoTuzemska({ ...oss, pohoda_clenenie_dph: "UN" }, "SK")).toBeNull();
    expect(prekazkaVydanej({ ...oss, pohoda_clenenie_dph: "UD" }, items, firmaSK, nastavenia)).toMatch(/OSS/);
  });
});

describe("V2 — dodanie do EÚ a vývoz nedostanú tuzemské prenesenie (UDpdp)", () => {
  const pripady: [string, any, string][] = [
    ["dodanie tovaru do EÚ (§ 43)", { reverse_charge: true, reverse_charge_type: "eu_b2b", eu_plnenie: "tovar" }, "UDdodEU"],
    ["dodanie do EÚ bez druhu = tovar", { reverse_charge: true, reverse_charge_type: "eu_b2b" }, "UDdodEU"],
    ["trojstranný obchod", { reverse_charge: true, reverse_charge_type: "eu_b2b", eu_plnenie: "trojstranny" }, "UDdod3"],
    ["služba do EÚ", { reverse_charge: true, reverse_charge_type: "eu_b2b", eu_plnenie: "sluzba" }, "UDzahrSl"],
    [
      "vývoz tovaru (§ 47)",
      { reverse_charge: true, reverse_charge_type: "export", customer_country: "US", customer_ic_dph: null },
      "UNodpS",
    ],
    [
      "služba mimo EÚ",
      { reverse_charge: true, reverse_charge_type: "export", eu_plnenie: "sluzba", customer_country: "US", customer_ic_dph: null },
      "UDzahr",
    ],
  ];
  for (const [nazov, o, kod] of pripady) {
    it(`${nazov} → ${kod}, bez KV; XML podľa XSD`, async () => {
      const x = buildPohodaInvoiceXml({
        company: firmaSK,
        nastavenia,
        invoices: [{ invoice: faktura(o), items: [polozka()] }],
      });
      expect(await overXsd(x)).toBeNull();
      expect(new Set(clenenia(x))).toEqual(new Set([kod]));
      expect(kv(x)).toEqual([]);
      // Uložené členenie pri vzniku faktúry je to isté.
      expect(resolveVatClassification({ ...firmaSK, pohoda_clenenie_dph_pdp: "UDpdp" }, faktura(o)).pohoda_clenenie_dph).toBe(kod);
    });
  }

  it("firma s vlastným číselníkom dostane svoj kód; tuzemské prenesenie ostáva UDpdp", () => {
    expect(
      clenenieMimoTuzemska({ reverseCharge: true, reverseChargeType: "export" }, "SK", [
        { kod: "UVyvoz", popis: "Vývoz tovaru § 47", agenda: "1207 U08" },
      ]),
    ).toBe("UVyvoz");
    expect(clenenieMimoTuzemska({ reverseCharge: true, reverseChargeType: "domestic_69" }, "SK", [])).toBeUndefined();
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [
        {
          invoice: faktura({
            reverse_charge: true,
            reverse_charge_type: "domestic_69",
            customer_country: "SK",
            customer_ic_dph: "SK2021999888",
            pdp_druh: "j",
          }),
          items: [polozka()],
        },
      ],
    });
    expect(clenenia(x)).toContain("UDpdp");
  });

  it("kontrola zastaví dodanie do EÚ s uloženým UDpdp", () => {
    expect(
      chybaClenenieMimoTuzemska(
        { reverse_charge: true, reverse_charge_type: "eu_b2b", eu_plnenie: "tovar", pohoda_clenenie_dph: "UDpdp" },
        "SK",
      ),
    ).toMatch(/UDdodEU/);
    // Česká firma má iné kódy — kontrola sa jej netýka.
    expect(
      chybaClenenieMimoTuzemska({ reverse_charge: true, reverse_charge_type: "eu_b2b", pohoda_clenenie_dph: "UD" }, "CZ"),
    ).toBeNull();
  });
});

/* ------------------------------------------------------------ prijaté */

const prijata = (o: any = {}) => ({
  id: "pi-1",
  company_id: "c1",
  type: "regular",
  invoice_number: "2026-778",
  supplier_name: "Dodávateľ s.r.o.",
  supplier_country: "SK",
  supplier_ico: "44111222",
  supplier_ic_dph: "SK2022111222",
  issue_date: "2026-10-05",
  delivery_date: "2026-10-03",
  received_date: "2026-10-06",
  due_date: "2026-10-19",
  variable_symbol: "2026778",
  currency: "EUR",
  amount_without_vat: 100,
  vat_amount: 23,
  amount_total: 123,
  payment_method: "prevod",
  pohoda_predkontacia: "1Fp",
  items: [{ name: "Materiál", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 23, total: 100 }],
  ...o,
});

describe("K4 — prijaté prenesenie v cudzej mene: položky nesú členenie prenesenia", () => {
  it("USD, celé v prenesení: hlavička aj položky PDpdp + B1; XML podľa XSD", async () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      nastavenia,
      doklady: [
        prijataAkoDoklad(
          prijata({
            supplier_country: "DE",
            supplier_ic_dph: "DE123456789",
            currency: "USD",
            exchange_rate: 1.1,
            vat_amount: 0,
            amount_total: 100,
            reverse_charge: true,
            dph_rezim: "samozdanenie",
            items: [],
          }),
        ),
      ],
    });
    expect(await overXsd(x)).toBeNull();
    expect(x).toContain("<inv:foreignCurrency>");
    expect(clenenia(x)).toEqual(["PDpdp", "PDpdp"]);
    expect(kv(x)).toEqual(["B1", "B1"]);
    expect(x).toMatch(/<inv:rateVAT>high<\/inv:rateVAT>/);
  });
});

describe("V4 — samozdanenie: dátum dane je deň dodania aj pri pevnom dátume zaúčtovania", () => {
  const pdp = prijata({
    vat_amount: 0,
    amount_total: 100,
    reverse_charge: true,
    dph_rezim: "samozdanenie",
    delivery_date: "2026-10-03",
    received_date: "2026-11-11",
    items: [{ name: "Stavebné práce", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 23, total: 100 }],
  });

  it("pevný dátum 30. 11.: dateTax = DUZP, dateAccounting = 30. 11.; XML podľa XSD", async () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      nastavenia: { ...nastavenia, datumZauctovaniaPevny: "2026-11-30" },
      doklady: [prijataAkoDoklad(pdp)],
    });
    expect(await overXsd(x)).toBeNull();
    expect(x).toContain("<inv:dateTax>2026-10-03</inv:dateTax>");
    expect(x).toContain("<inv:dateAccounting>2026-11-30</inv:dateAccounting>");
  });

  it("bežná faktúra si pevný dátum ako dátum odpočtu nechá", () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      nastavenia: { ...nastavenia, datumZauctovaniaPevny: "2026-11-30" },
      doklady: [prijataAkoDoklad(prijata())],
    });
    expect(x).toContain("<inv:dateTax>2026-11-30</inv:dateTax>");
  });

  it("voľba „odpočet = zaúčtovanie“ samozdanenie neposúva", () => {
    const d = { vystavenie: "2026-10-05", dodanie: "2026-10-03", dorucenie: "2026-11-11", zauctovanie: "2026-11-30" };
    const n = { datumZapisu: "vyhotovenie", datumOdpoctu: "zauctovanie" } as any;
    expect(datumyPrijateho({ ...d, samozdanenie: true }, n).odpocet).toBe("2026-10-03");
    expect(datumyPrijateho({ ...d, samozdanenie: false }, n).odpocet).toBe("2026-11-30");
  });
});

describe("V5 — prijatá bez nároku na odpočet: PB, bez KV", () => {
  it("tuzemská s DPH a odpocet=false → PB na hlavičke aj položkách, bez KV; XML podľa XSD", async () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      nastavenia,
      doklady: [prijataAkoDoklad(prijata({ odpocet: false }))],
    });
    expect(await overXsd(x)).toBeNull();
    expect(new Set(clenenia(x))).toEqual(new Set(["PB"]));
    expect(kv(x)).toEqual([]);
  });

  it("vlastné členenie dokladu ostáva; s nárokom ostáva predvolené PD", () => {
    expect(clenenieRezimuPrijatej({ odpocet: true, vat_amount: 23 }, { krajina: "SK", platitel: true })).toBeNull();
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      nastavenia,
      doklady: [prijataAkoDoklad(prijata({ odpocet: false, pohoda_clenenie_dph: "PK" }))],
    });
    expect(new Set(clenenia(x))).toEqual(new Set(["PK"]));
    // Cudzia DPH (hotel v Rakúsku) nie je tuzemské „bez nároku“.
    expect(
      clenenieRezimuPrijatej(
        { odpocet: false, vat_amount: 20, supplier_country: "AT" },
        { krajina: "SK", platitel: true },
      ),
    ).toBeNull();
  });
});

describe("V6 — nadobudnutie tovaru z EÚ: PDnadEU so samozdanením a KV B.1", () => {
  it("bez vlastného členenia: PDnadEU v hlavičke aj položkách, sadzba high s DPH 0, B1; XML podľa XSD", async () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      nastavenia,
      doklady: [
        prijataAkoDoklad(
          prijata({
            supplier_country: "DE",
            supplier_ic_dph: "DE123456789",
            vat_amount: 0,
            amount_total: 100,
            dph_rezim: "nadobudnutie",
            items: [{ name: "Stroj", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 0, total: 100 }],
          }),
        ),
      ],
    });
    expect(await overXsd(x)).toBeNull();
    expect(new Set(clenenia(x))).toEqual(new Set(["PDnadEU"]));
    expect(new Set(kv(x))).toEqual(new Set(["B1"]));
    expect(x).toMatch(/<inv:rateVAT>high<\/inv:rateVAT>/);
    expect(x).toContain("<inv:dateTax>2026-10-03</inv:dateTax>");
  });

  it("bez nároku → PBnadEU; česká firma bez číselníka nič (ostáva ako doteraz)", () => {
    expect(
      clenenieRezimuPrijatej({ _rezim: "nadobudnutie", odpocet: false }, { krajina: "SK", platitel: true }),
    ).toBe("PBnadEU");
    expect(clenenieRezimuPrijatej({ _rezim: "nadobudnutie" }, { krajina: "CZ", platitel: true })).toBeNull();
    expect(clenenieRezimuPrijatej({ _rezim: "nadobudnutie" }, { krajina: "SK", platitel: false })).toBeNull();
  });
});
