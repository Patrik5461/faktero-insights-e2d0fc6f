/*
  Všetky exporty do Pohody proti oficiálnym schémam Stormware (version_2):
  vystavené faktúry všetkých typov, prijaté faktúry a dobropisy, bločky
  (faktúra / pokladňa / interný doklad), daňový doklad k platbe, pokladňa,
  bankový výpis, adresár, sklad, zákazky, príjemky a výdajky a storno.

  Každý doklad z balíka sa overí proti schéme svojej agendy a test skontroluje
  aj kľúčové polia pre zaúčtovanie a DPH — schéma sama povie len to, že XML je
  dobre postavené, nie že v ňom nič nechýba.

  `POHODA_VZORKY=<adresár> npx vitest run export-pohoda-xsd-vsetko` uloží
  vzorky (jeden súbor na typ dokladu) na skúšobný import do Pohody.
*/
import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import {
  buildPohodaAddressbookXml,
  buildPohodaBankXml,
  buildPohodaCashXml,
  buildPohodaContractsXml,
  buildPohodaDavkaXml,
  buildPohodaExpensesXml,
  buildPohodaInvoiceXml,
  buildPohodaMovementsXml,
  buildPohodaStockXml,
  buildPohodaStornaXml,
  zoskupPohyby,
} from "./export.server";
import { prijataAkoDoklad } from "./prijate-do-pohody";

xmlRegisterFsInputProviders();

const SCHEMY: Record<string, string> = {
  inv: "invoice.xsd",
  vch: "voucher.xsd",
  bnk: "bank.xsd",
  int: "intDoc.xsd",
  adb: "addressbook.xsd",
  stk: "stock.xsd",
  con: "contract.xsd",
  pri: "prijemka.xsd",
  vyd: "vydejka.xsd",
};
const validatory = new Map<string, XsdValidator>();
function validator(prefix: string): XsdValidator {
  const v = validatory.get(prefix);
  if (v) return v;
  const url = new URL(`./schemy/pohoda/${SCHEMY[prefix]}`, import.meta.url);
  const novy = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
  validatory.set(prefix, novy);
  return novy;
}

/** Každý doklad z `dataPack` samostatne proti schéme jeho agendy. */
function chybySchemy(xml: string): string[] {
  const ns = [
    ...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`)),
  ];
  const chyby: string[] = [];
  const polozky = [...xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)];
  if (!polozky.length) chyby.push("balík je prázdny");
  for (const m of polozky) {
    const vnutro = m[1].trim();
    const prefix = /^<(\w+):/.exec(vnutro)?.[1] ?? "";
    if (!SCHEMY[prefix]) {
      chyby.push(`neznáma agenda ${prefix}`);
      continue;
    }
    const prvok = vnutro.replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`);
    const doc = XmlDocument.fromString(prvok);
    try {
      validator(prefix).validate(doc);
    } catch (e: any) {
      chyby.push(
        `${prefix}: ${String(e?.message ?? e)} ${JSON.stringify(e?.details ?? "").slice(0, 400)}`,
      );
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}

const VZORKY = process.env.POHODA_VZORKY;
function uloz(nazov: string, xml: string) {
  if (!VZORKY) return;
  mkdirSync(VZORKY, { recursive: true });
  writeFileSync(`${VZORKY}/${nazov}.xml`, xml, "utf8");
}

/** Hodnota prvého výskytu elementu (bez ohľadu na odsadenie). */
function hodnota(xml: string, el: string): string | null {
  const m = new RegExp(`<${el}(?:\\s[^>]*)?>([^<]*)</${el}>`).exec(xml);
  return m ? m[1] : null;
}

/* ------------------------------------------------------------- údaje */

const firmaSK: any = {
  id: "c1",
  name: "Vzorová firma s.r.o.",
  ico: "36123456",
  dic: "2020123456",
  ic_dph: "SK2020123456",
  vat_payer: true,
  country: "SK",
  street: "Hlavná 1",
  city: "Nitra",
  zip: "94901",
  iban: "SK3112000000198742637541",
};
const firmaCZ: any = {
  ...firmaSK,
  ico: "27123456",
  dic: "CZ27123456",
  ic_dph: null,
  country: "CZ",
};

const nastavenia: any = {
  predkontacia: "3Fv",
  predkontaciaZaloha: "3Zv",
  predkontaciaDobropis: "3Dv",
  clenenieDph: "UD",
  clenenieDphPdp: "UDpdp",
  predkontaciaPrijata: "1Fp",
  clenenieDphPrijata: "PD",
  clenenieDphPdpPrijata: "PDpdp",
  banka: "TB",
  stredisko: "BA",
  pokladna: "HP",
  predkontaciaPokladna: "1Pv",
  predkontaciaBanka: "1Bv",
  sklad: "HLAVNY",
  blockyPodlaPlatby: true,
};

const polozka = (o: any = {}) => ({
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
  variable_symbol: "2026001",
  constant_symbol: "0308",
  specific_symbol: "77",
  issue_date: "2026-10-10",
  delivery_date: "2026-10-08",
  due_date: "2026-10-24",
  currency: "EUR",
  customer_name: "Odberateľ a.s.",
  customer_street: "Obchodná 5",
  customer_city: "Bratislava",
  customer_zip: "81106",
  customer_country: "SK",
  customer_ico: "35999888",
  customer_dic: "2021999888",
  customer_ic_dph: "SK2021999888",
  customer_email: "uctaren@odberatel.sk",
  payment_method: "bank_transfer",
  order_number: "OBJ-55/2026",
  intro_note: "Fakturujeme vám služby za október",
  notes: "Ďakujeme za spoluprácu",
  int_poznamka: "Interná poznámka",
  stredisko: "KE",
  cinnost: "SLUZBY",
  job_id: "job-1",
  subtotal: 100,
  vat_total: 23,
  total: 123,
  ...o,
});

/* ------------------------------------------------- vystavené faktúry */

describe("Pohoda — vystavené faktúry proti invoice.xsd", () => {
  it("faktúra SK: všetky sadzby 23/19/5/0, symboly, objednávka, zákazka, stredisko, účet, predkontácia", () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      zakazky: { "job-1": "Z2026-01" },
      odkazy: { "inv-1": "https://faktero.sk/api/public/faktura/abc" },
      invoices: [
        {
          invoice: faktura({ subtotal: 400, vat_total: 47, total: 447 }),
          items: [
            polozka(),
            polozka({
              name: "Tovar 19 %",
              quantity: 1,
              unit_price: 100,
              vat_rate: 19,
              vat_amount: 19,
              total: 119,
            }),
            polozka({
              name: "Kniha 5 %",
              quantity: 1,
              unit_price: 100,
              vat_rate: 5,
              vat_amount: 5,
              total: 105,
            }),
            polozka({
              name: "Oslobodené",
              quantity: 1,
              unit_price: 100,
              vat_rate: 0,
              vat_amount: 0,
              total: 100,
            }),
          ],
        },
      ],
    });
    uloz("01-vydana-faktura-sk", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(x, "inv:invoiceType")).toBe("issuedInvoice");
    expect(x).toContain("<typ:numberRequested>FA2026001</typ:numberRequested>");
    expect(hodnota(x, "inv:symVar")).toBe("2026001");
    expect(hodnota(x, "inv:symConst")).toBe("0308");
    expect(hodnota(x, "inv:date")).toBe("2026-10-10");
    expect(hodnota(x, "inv:dateTax")).toBe("2026-10-08");
    expect(hodnota(x, "inv:dateDue")).toBe("2026-10-24");
    expect(hodnota(x, "inv:numberOrder")).toBe("OBJ-55/2026");
    expect(x).toContain("<inv:contract><typ:ids>Z2026-01</typ:ids></inv:contract>");
    expect(x).toContain("<inv:centre><typ:ids>KE</typ:ids></inv:centre>");
    expect(x).toContain("<inv:activity><typ:ids>SLUZBY</typ:ids></inv:activity>");
    expect(x).toContain("<inv:account><typ:ids>TB</typ:ids></inv:account>");
    expect(x).toContain("<inv:accounting><typ:ids>3Fv</typ:ids></inv:accounting>");
    expect(x).toContain("<inv:classificationVAT><typ:ids>UD</typ:ids></inv:classificationVAT>");
    expect(hodnota(x, "typ:ico")).toBe("35999888");
    expect(hodnota(x, "typ:dic")).toBe("2021999888");
    expect(hodnota(x, "typ:icDph")).toBe("SK2021999888");
    // SK od 2025: 23 % základná (high), 19 % znížená (low), 5 % druhá znížená (third).
    expect(x).toMatch(
      /<inv:rateVAT>high<\/inv:rateVAT>[\s\S]*<inv:rateVAT>low<\/inv:rateVAT>[\s\S]*<inv:rateVAT>third<\/inv:rateVAT>[\s\S]*<inv:rateVAT>none<\/inv:rateVAT>/,
    );
    expect(hodnota(x, "typ:priceHigh")).toBe("100.00");
    expect(hodnota(x, "typ:priceHighVAT")).toBe("23.00");
    expect(hodnota(x, "typ:priceLow")).toBe("100.00");
    expect(hodnota(x, "typ:priceLowVAT")).toBe("19.00");
    expect(hodnota(x, "typ:price3")).toBe("100.00");
    expect(hodnota(x, "typ:price3VAT")).toBe("5.00");
    expect(hodnota(x, "typ:priceNone")).toBe("100.00");
    // Pohoda nesmie doklad prerátať po svojom — zaokrúhlenie ide z Faktera.
    expect(hodnota(x, "inv:roundingDocument")).toBe("none");
    expect(hodnota(x, "inv:roundingVAT")).toBe("none");
  });

  it("zálohová faktúra ide ako issuedAdvanceInvoice s predkontáciou zálohy a bez členenia DPH", () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [
        {
          invoice: faktura({ id: "inv-z", type: "proforma", invoice_number: "ZF2026001" }),
          items: [polozka()],
        },
      ],
    });
    uloz("02-vydana-zalohova", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(x, "inv:invoiceType")).toBe("issuedAdvanceInvoice");
    expect(x).toContain("<inv:accounting><typ:ids>3Zv</typ:ids></inv:accounting>");
    // „Nepoužívá se u typů Proforma a Zálohová faktura" (invoice.xsd).
    expect(x).not.toContain("<inv:classificationVAT>");
  });

  it("dobropis SK: kladné sumy, väzba na opravovanú faktúru a pôvodné číslo dokladu", () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      opravovane: { "inv-d": "FA2026001" },
      povodneCisla: { "inv-d": "FA2026001" },
      invoices: [
        {
          invoice: faktura({
            id: "inv-d",
            type: "credit_note",
            invoice_number: "DB2026001",
            variable_symbol: "2026001",
            subtotal: -100,
            vat_total: -23,
            total: -123,
          }),
          items: [polozka({ quantity: -2, subtotal: -100, vat_amount: -23, total: -123 })],
        },
      ],
    } as any);
    uloz("03-vydany-dobropis", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(x, "inv:invoiceType")).toBe("issuedCreditNotice");
    expect(x).toContain("<inv:correctiveDocument");
    expect(hodnota(x, "inv:originalDocumentNumber")).toBe("FA2026001");
    expect(hodnota(x, "inv:quantity")).toBe("2");
    expect(hodnota(x, "typ:priceHigh")).toBe("100.00");
    expect(x).toContain("<inv:accounting><typ:ids>3Dv</typ:ids></inv:accounting>");
  });

  it("ťarchopis SK ide ako vrubopis (issuedDebitNote) s pôvodným číslom", () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      povodneCisla: { "inv-t": "FA2026001" },
      invoices: [
        {
          invoice: faktura({ id: "inv-t", type: "debit_note", invoice_number: "TP2026001" }),
          items: [polozka()],
        },
      ],
    } as any);
    uloz("04-vydany-tarchopis", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(x, "inv:invoiceType")).toBe("issuedDebitNote");
    expect(hodnota(x, "inv:originalDocumentNumber")).toBe("FA2026001");
    expect(hodnota(x, "typ:priceHigh")).toBe("100.00");
  });

  it("opravný doklad § 25a: zníženie ako dobropis, vrátenie (kladný) ako vrubopis", () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      povodneCisla: { "inv-25a": "FA2026001", "inv-25b": "FA2026001" },
      invoices: [
        {
          invoice: faktura({
            id: "inv-25a",
            type: "credit_note",
            oprava_25a: true,
            invoice_number: "OD2026001",
            subtotal: -100,
            vat_total: -23,
            total: -123,
          }),
          items: [polozka({ quantity: -2, subtotal: -100, vat_amount: -23, total: -123 })],
        },
        {
          invoice: faktura({
            id: "inv-25b",
            type: "credit_note",
            oprava_25a: true,
            invoice_number: "OD2026002",
          }),
          items: [polozka()],
        },
      ],
    } as any);
    uloz("05-oprava-25a", x);
    expect(chybySchemy(x)).toEqual([]);
    const [a, b] = x.split("<dat:dataPackItem").slice(1);
    expect(hodnota(a, "inv:invoiceType")).toBe("issuedCreditNotice");
    expect(hodnota(a, "typ:priceHigh")).toBe("100.00");
    expect(hodnota(b, "inv:invoiceType")).toBe("issuedDebitNote");
    expect(hodnota(b, "typ:priceHigh")).toBe("100.00");
  });

  it("vyúčtovacia faktúra s odpočtom zálohy (invoiceAdvancePaymentItem so zálohovou faktúrou)", () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      zalohy: { "inv-v": { cislo: "ZF2026001", zaklad: 50, dph: 11.5, sadzba: 23 } },
      invoices: [
        { invoice: faktura({ id: "inv-v", invoice_number: "FA2026002" }), items: [polozka()] },
      ],
    });
    uloz("06-faktura-odpocet-zalohy", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toMatch(/<inv:invoiceAdvancePaymentItem>[\s\S]*<typ:number>ZF2026001<\/typ:number>/);
    expect(hodnota(x, "typ:priceHigh")).toBe("50.00");
    expect(hodnota(x, "typ:priceHighVAT")).toBe("11.50");
  });

  it("prenesenie daňovej povinnosti a dodanie do EÚ: členenie pre prenesenie, poznámka, IČ DPH a krajina", () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [
        {
          invoice: faktura({
            id: "inv-pdp",
            reverse_charge: true,
            customer_country: "DE",
            customer_ic_dph: "DE123456789",
            customer_dic: null,
            subtotal: 100,
            vat_total: 0,
            total: 100,
          }),
          items: [polozka({ vat_rate: 0, vat_amount: 0, total: 100 })],
        },
      ],
    });
    uloz("07-faktura-prenesenie-eu", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toContain("<inv:classificationVAT><typ:ids>UDpdp</typ:ids></inv:classificationVAT>");
    expect(x).toContain("<typ:country><typ:ids>DE</typ:ids></typ:country>");
    expect(hodnota(x, "typ:icDph")).toBe("DE123456789");
    expect(hodnota(x, "inv:note")).toContain("Prenesenie daňovej povinnosti");
  });

  it("faktúra v cudzej mene: položky aj súhrn v mene, kurz a mena", () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [
        {
          invoice: faktura({
            id: "inv-usd",
            currency: "USD",
            exchange_rate: 1.08,
            customer_country: "US",
            subtotal: 100,
            vat_total: 0,
            total: 100,
          }),
          items: [polozka({ vat_rate: 0, vat_amount: 0, total: 100 })],
        },
      ],
    });
    uloz("08-faktura-cudzia-mena", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toContain("<typ:currency><typ:ids>USD</typ:ids></typ:currency>");
    expect(hodnota(x, "typ:rate")).not.toBeNull();
    expect(x).toMatch(/<inv:invoiceItem>[\s\S]*<inv:foreignCurrency>/);
    expect(x).not.toMatch(/<inv:invoiceSummary>[\s\S]*<inv:homeCurrency>/);
  });

  it("daňový doklad k prijatej platbe ide ako interný doklad (intDoc.xsd)", () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [
        {
          invoice: faktura({ id: "inv-dp", type: "advance_payment", invoice_number: "DP2026001" }),
          items: [polozka()],
        },
      ],
    });
    uloz("09-danovy-doklad-k-platbe", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toContain('<int:intDoc version="2.0">');
    expect(hodnota(x, "int:symVar")).toBe("2026001");
    expect(hodnota(x, "typ:priceHigh")).toBe("100.00");
    expect(hodnota(x, "typ:priceHighVAT")).toBe("23.00");
    expect(hodnota(x, "typ:icDph")).toBe("SK2021999888");
  });

  it("CZ firma: sadzby 21/12, opravný daňový doklad (issuedCorrectiveTax) so znamienkom", () => {
    const x = buildPohodaInvoiceXml({
      company: firmaCZ,
      nastavenia: { ...nastavenia, banka: "KB" },
      opravovane: { "cz-d": "FV2026001" },
      invoices: [
        {
          invoice: faktura({
            id: "cz-f",
            invoice_number: "FV2026001",
            currency: "CZK",
            customer_country: "CZ",
            customer_ic_dph: null,
            customer_dic: "CZ12345678",
            subtotal: 200,
            vat_total: 33,
            total: 233,
          }),
          items: [
            polozka({ unit_price: 50, vat_rate: 21, vat_amount: 21, total: 121 }),
            polozka({ unit_price: 50, vat_rate: 12, vat_amount: 12, total: 112 }),
          ],
        },
        {
          invoice: faktura({
            id: "cz-d",
            type: "credit_note",
            invoice_number: "OD2026001",
            currency: "CZK",
            customer_country: "CZ",
            customer_ic_dph: null,
            subtotal: -100,
            vat_total: -21,
            total: -121,
          }),
          items: [
            polozka({ quantity: -2, vat_rate: 21, subtotal: -100, vat_amount: -21, total: -121 }),
          ],
        },
      ],
    });
    uloz("10-cz-faktura-a-opravny-doklad", x);
    expect(chybySchemy(x)).toEqual([]);
    const [f, d] = x.split("<dat:dataPackItem").slice(1);
    expect(hodnota(f, "typ:priceHigh")).toBe("100.00");
    expect(hodnota(f, "typ:priceLow")).toBe("100.00");
    expect(hodnota(d, "inv:invoiceType")).toBe("issuedCorrectiveTax");
    expect(d).toContain("<inv:correctiveDocument");
    // CZ opravný doklad nesie zníženie so záporným znamienkom.
    expect(hodnota(d, "typ:priceHigh")).toBe("-100.00");
    // Pôvodné číslo dokladu a KV DPH sú len v SK verzii.
    expect(d).not.toContain("originalDocumentNumber");
    expect(x).not.toContain("classificationKVDPH");
  });

  it("OSS: režim MOSS so štátom spotreby a priehradky podľa jeho sadzieb", () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [
        {
          invoice: faktura({
            id: "inv-oss",
            oss: true,
            oss_country: "DE",
            customer_country: "DE",
            customer_ico: null,
            customer_dic: null,
            customer_ic_dph: null,
            subtotal: 200,
            vat_total: 26,
            total: 226,
          }),
          items: [
            polozka({ unit_price: 50, vat_rate: 19, vat_amount: 19, total: 119 }),
            polozka({ unit_price: 50, vat_rate: 7, vat_amount: 7, total: 107 }),
          ],
        },
      ],
    });
    uloz("26-faktura-oss", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toContain("<inv:MOSS><typ:ids>DE</typ:ids></inv:MOSS>");
    expect(hodnota(x, "typ:priceHigh")).toBe("100.00");
    expect(hodnota(x, "typ:priceHighVAT")).toBe("19.00");
    expect(hodnota(x, "typ:priceLow")).toBe("100.00");
  });

  it("dlhá poznámka položky sa skráti na 90 znakov (typ:string90)", () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      invoices: [
        { invoice: faktura({ id: "inv-n" }), items: [polozka({ description: "x".repeat(200) })] },
      ],
    });
    expect(chybySchemy(x)).toEqual([]);
  });
});

/* -------------------------------------------------- prijaté doklady */

const prijata = (o: any = {}) => ({
  id: "pi-1",
  company_id: "c1",
  type: "regular",
  invoice_number: "2026-778",
  supplier_name: "Dodávateľ s.r.o.",
  supplier_street: "Priemyselná 3",
  supplier_city: "Žilina",
  supplier_zip: "01001",
  supplier_country: "SK",
  supplier_ico: "44111222",
  supplier_dic: "2022111222",
  supplier_ic_dph: "SK2022111222",
  supplier_iban: "SK8975000000000012345671",
  issue_date: "2026-10-05",
  delivery_date: "2026-10-03",
  received_date: "2026-10-06",
  due_date: "2026-10-19",
  variable_symbol: "2026778",
  constant_symbol: "0308",
  specific_symbol: null,
  order_number: "NAK-12",
  currency: "EUR",
  amount_without_vat: 100,
  vat_amount: 23,
  amount_total: 123,
  payment_method: "prevod",
  pohoda_predkontacia: "1Fp",
  pohoda_clenenie_dph: "PD",
  zauctovane_at: "2026-10-07T10:00:00Z",
  items: [{ name: "Materiál", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 23, total: 100 }],
  ...o,
});

describe("Pohoda — prijaté doklady proti invoice/voucher/intDoc.xsd", () => {
  it("prijatá faktúra SK: číslo dodávateľa, VS, dátum dodania, splatnosť, účet dodávateľa, krajina", () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      nastavenia,
      doklady: [prijataAkoDoklad(prijata())],
    });
    uloz("11-prijata-faktura", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(x, "inv:invoiceType")).toBe("receivedInvoice");
    expect(hodnota(x, "inv:originalDocument")).toBe("2026-778");
    expect(hodnota(x, "inv:symVar")).toBe("2026778");
    expect(hodnota(x, "inv:symConst")).toBe("0308");
    expect(hodnota(x, "inv:date")).toBe("2026-10-05");
    expect(hodnota(x, "inv:dateTax")).toBe("2026-10-03");
    // SK: dátum dodania tovaru je samostatné pole prijatej faktúry.
    expect(hodnota(x, "inv:dateDelivery")).toBe("2026-10-03");
    expect(hodnota(x, "inv:dateDue")).toBe("2026-10-19");
    expect(hodnota(x, "inv:numberOrder")).toBe("NAK-12");
    expect(x).toContain("<typ:country><typ:ids>SK</typ:ids></typ:country>");
    expect(hodnota(x, "typ:icDph")).toBe("SK2022111222");
    expect(x).toContain("<inv:paymentAccount>");
    expect(hodnota(x, "typ:priceHigh")).toBe("100.00");
    expect(hodnota(x, "typ:priceHighVAT")).toBe("23.00");
    expect(hodnota(x, "inv:roundingDocument")).toBe("none");
  });

  it("prijatý dobropis: kladné sumy a pôvodné číslo opravovanej faktúry", () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      nastavenia,
      doklady: [
        prijataAkoDoklad(
          prijata({
            id: "pi-d",
            invoice_number: "D-2026-5",
            opravuje_cislo: "2026-778",
            amount_without_vat: -100,
            vat_amount: -23,
            amount_total: -123,
            items: [{ name: "Vrátenie", quantity: 1, unit_price: -100, vat_rate: 23, total: -100 }],
          }),
        ),
      ],
    });
    uloz("12-prijaty-dobropis", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(x, "inv:invoiceType")).toBe("receivedCreditNotice");
    expect(hodnota(x, "inv:originalDocumentNumber")).toBe("2026-778");
    expect(hodnota(x, "typ:priceHigh")).toBe("100.00");
  });

  it("prijatá faktúra v prenesení (samozdanenie) z EÚ: členenie PDP a KV B1", () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      nastavenia,
      doklady: [
        prijataAkoDoklad(
          prijata({
            id: "pi-pdp",
            supplier_country: "CZ",
            supplier_ic_dph: "CZ12345678",
            reverse_charge: true,
            pohoda_clenenie_dph: null,
            vat_amount: 0,
            amount_total: 100,
            items: [{ name: "Služba", quantity: 1, unit_price: 100, vat_rate: 23, total: 100 }],
          }),
        ),
      ],
    });
    uloz("13-prijata-prenesenie", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toContain("<inv:classificationVAT><typ:ids>PDpdp</typ:ids></inv:classificationVAT>");
    expect(x).toContain("<typ:country><typ:ids>CZ</typ:ids></typ:country>");
  });

  it("prijatá faktúra v cudzej mene s kurzom", () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      nastavenia,
      doklady: [
        prijataAkoDoklad(prijata({ id: "pi-usd", currency: "USD", exchange_rate: 1.1, items: [] })),
      ],
    });
    uloz("14-prijata-cudzia-mena", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toContain("<typ:currency><typ:ids>USD</typ:ids></typ:currency>");
  });

  it("samofaktúra (prijatá, vystavená odberateľom) ide ako prijatá faktúra", () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      nastavenia,
      doklady: [
        prijataAkoDoklad(
          prijata({
            id: "pi-sf",
            invoice_number: "SF2026001",
            samofakturacia: true,
            items: [{ name: "Výkup", quantity: 1, unit_price: 100, vat_rate: 23 }],
          }),
        ),
      ],
    });
    uloz("15-samofaktura", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(x, "inv:originalDocument")).toBe("SF2026001");
  });

  it("CZ firma: prijatá faktúra s dátumom pre KH, prijatý opravný doklad so znamienkom, bez KV DPH", () => {
    const x = buildPohodaExpensesXml({
      company: firmaCZ,
      nastavenia,
      doklady: [
        prijataAkoDoklad(
          prijata({
            id: "cz-p",
            currency: "CZK",
            supplier_country: "CZ",
            supplier_ic_dph: null,
            supplier_dic: "CZ44111222",
            items: [{ name: "Materiál", quantity: 1, unit_price: 100, vat_rate: 21, total: 100 }],
            vat_amount: 21,
            amount_total: 121,
          }),
        ),
        prijataAkoDoklad(
          prijata({
            id: "cz-pd",
            invoice_number: "OD-5",
            opravuje_cislo: "2026-778",
            currency: "CZK",
            supplier_country: "CZ",
            amount_without_vat: -100,
            vat_amount: -21,
            amount_total: -121,
            items: [{ name: "Vrátenie", quantity: 1, unit_price: -100, vat_rate: 21, total: -100 }],
          }),
        ),
      ],
    });
    uloz("25-cz-prijate", x);
    expect(chybySchemy(x)).toEqual([]);
    const [f, d] = x.split("<dat:dataPackItem").slice(1);
    expect(hodnota(f, "inv:dateKHDPH")).toBe("2026-10-03");
    expect(f).not.toContain("dateDelivery");
    expect(hodnota(d, "inv:invoiceType")).toBe("receivedCorrectiveTax");
    expect(hodnota(d, "typ:priceHigh")).toBe("-100.00");
    expect(x).not.toContain("classificationKVDPH");
    expect(x).not.toContain("originalDocumentNumber");
  });

  it("prijatá faktúra bez nároku na odpočet nesie upozornenie v poznámke", () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      nastavenia,
      doklady: [prijataAkoDoklad(prijata({ odpocet: false }))],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(x, "inv:note")).toContain("Bez nároku na odpočet DPH");
  });

  const blocek = (o: any = {}) => ({
    id: "exp-1",
    supplier_name: "Benzínka a.s.",
    supplier_ico: "31111111",
    supplier_ic_dph: "SK2020000001",
    document_number: "O-123",
    issue_date: "2026-10-04",
    currency: "EUR",
    total_amount: 61.5,
    vat_breakdown: [{ sadzba: 23, zaklad: 50, dph: 11.5 }],
    category: "pohonne_hmoty",
    payment_method: "hotovost",
    ...o,
  });

  it("bloček: hotovosť do pokladne (voucher), karta ako interný doklad, prevod ako prijatá faktúra", () => {
    const x = buildPohodaExpensesXml({
      company: firmaSK,
      nastavenia,
      doklady: [
        blocek(),
        blocek({ id: "exp-2", payment_method: "karta" }),
        blocek({ id: "exp-3", payment_method: "prevod" }),
      ],
    });
    uloz("16-blocky", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toContain("<vch:voucherType>expense</vch:voucherType>");
    expect(x).toContain("<vch:cashAccount><typ:ids>HP</typ:ids></vch:cashAccount>");
    expect(x).toContain('<int:intDoc version="2.0">');
    expect(x).toContain("<inv:invoiceType>receivedInvoice</inv:invoiceType>");
    expect(hodnota(x, "typ:priceHighVAT")).toBe("11.50");
  });
});

/* ------------------------------------------ pokladňa, banka, číselníky */

describe("Pohoda — pokladňa, banka a číselníky", () => {
  it("pokladňa (voucher.xsd)", () => {
    const x = buildPohodaCashXml({
      company: firmaSK,
      nastavenia,
      pohyby: [
        {
          id: "c-1",
          type: "prijem",
          amount: 200,
          entry_date: "2026-10-01",
          entry_number: "PPD1",
          description: "Vklad",
        },
        {
          id: "c-2",
          type: "vydaj",
          amount: -15.2,
          entry_date: "2026-10-02",
          entry_number: "VPD1",
          description: "Známky",
        },
      ],
    });
    uloz("17-pokladna", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toContain("<vch:voucherType>receipt</vch:voucherType>");
    expect(x).toContain("<vch:cashAccount><typ:ids>HP</typ:ids></vch:cashAccount>");
    expect(hodnota(x, "typ:priceNone")).toBe("200.00");
  });

  it("bankový výpis (bank.xsd): účet, číslo výpisu, symboly, protiúčet", () => {
    const x = buildPohodaBankXml({
      company: firmaSK,
      nastavenia,
      cisloVypisu: "10",
      datumVypisu: "2026-10-31",
      pohyby: [
        {
          datum: "2026-10-12",
          suma: 123,
          smer: "prijem",
          popis: "Úhrada FA2026001",
          protistrana: "Odberateľ a.s.",
          protiucet: "SK3112000000198742637541",
          vs: "2026001",
          ks: "0308",
        },
        {
          datum: "2026-10-15",
          suma: 2.5,
          smer: "vydaj",
          popis: "Poplatok",
          oznacenie: "poplatok" as any,
        },
      ],
    });
    uloz("18-bankovy-vypis", x);
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toContain("<bnk:account><typ:ids>TB</typ:ids></bnk:account>");
    expect(hodnota(x, "bnk:symVar")).toBe("2026001");
    expect(x).toContain("<typ:bankCode>1200</typ:bankCode>");
  });

  it("adresár, skladové karty, zákazky, príjemky/výdajky a storno", () => {
    const zakaznici = [
      {
        id: "cu-1",
        name: "Odberateľ a.s.",
        street: "Obchodná 5",
        city: "Bratislava",
        zip: "81106",
        country: "SK",
        ico: "35999888",
        dic: "2021999888",
        ic_dph: "SK2021999888",
        email: "a@b.sk",
        phone: "+421900000000",
        updated_at: "2026-10-01T10:00:00Z",
      },
    ];
    const zasoby = [
      {
        id: "st-1",
        name: "Papier A4",
        sku: "PAP-A4",
        unit: "bal",
        vat_rate: 23,
        purchase_price: 3,
        sale_price: 4.5,
        updated_at: "2026-10-01T10:00:00Z",
      },
    ];
    const zakazky = [
      {
        id: "job-1",
        job_number: "Z2026-01",
        name: "Rekonštrukcia",
        start_date: "2026-10-01",
        customer_name: "Odberateľ a.s.",
      },
    ];
    const pohyby = [
      {
        id: "m-1",
        type: "prijem",
        quantity: 10,
        unit_cost: 3,
        vat_rate: 23,
        created_at: "2026-10-02T08:00:00Z",
        stock_item_id: "st-1",
        name: "Papier A4",
        sku: "PAP-A4",
      },
      {
        id: "m-2",
        type: "vydaj",
        quantity: -2,
        unit_price: 4.5,
        vat_rate: 23,
        created_at: "2026-10-03T08:00:00Z",
        stock_item_id: "st-1",
        name: "Papier A4",
        sku: "PAP-A4",
      },
    ];
    const a = buildPohodaAddressbookXml({ company: firmaSK, zakaznici });
    const s = buildPohodaStockXml({ company: firmaSK, zasoby, nastavenia });
    const z = buildPohodaContractsXml({ company: firmaSK, zakazky });
    const p = buildPohodaMovementsXml({
      company: firmaSK,
      skupiny: zoskupPohyby(pohyby),
      nastavenia,
    });
    const st = buildPohodaStornaXml({
      company: firmaSK,
      storna: [{ id: "inv-1", cislo: "FA2026001" }],
    });
    uloz("19-adresar", a);
    uloz("20-skladove-karty", s);
    uloz("21-zakazky", z);
    uloz("22-prijemky-vydajky", p);
    uloz("23-storno", st);
    for (const x of [a, s, z, p, st]) expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(a, "typ:icDph")).toBe("SK2021999888");
  });

  it("dávka konektora so všetkými agendami naraz", () => {
    const x = buildPohodaDavkaXml({
      company: firmaSK,
      nastavenia,
      invoices: [{ invoice: faktura(), items: [polozka()] }],
      doklady: [prijataAkoDoklad(prijata())],
      pohyby: [{ id: "c-1", type: "prijem", amount: 10, entry_date: "2026-10-01" }],
    });
    uloz("24-davka-konektora", x);
    expect(chybySchemy(x)).toEqual([]);
  });

  it("kontrola schémy chybu naozaj chytí", () => {
    const x = buildPohodaCashXml({
      company: firmaSK,
      pohyby: [{ id: "c-1", type: "prijem", amount: 10, entry_date: "2026-10-01" }],
    }).replace("<vch:date>", "<vch:nezmysel>1</vch:nezmysel><vch:date>");
    expect(chybySchemy(x).length).toBeGreaterThan(0);
  });
});

/* ----------------------------------------------- nebezpečné vstupy */

describe("Pohoda — text z dokladu s &, <, ]]> a riadiacimi znakmi", () => {
  // \u000B je „ručné zalomenie“ z Wordu, \u0001 a ￿ sa do XML 1.0 nesmú dostať ani ako entita.
  const zly = "A&B <script>x</script> ]]> \"q\" 'a'\u000B\u0001￿=1+1";
  it("faktúra ostane platná podľa invoice.xsd a text sa zachová bez zakázaných znakov", () => {
    const x = buildPohodaInvoiceXml({
      company: firmaSK,
      nastavenia,
      invoices: [
        {
          invoice: faktura({
            customer_name: zly,
            customer_street: zly,
            order_number: zly,
            notes: zly,
            intro_note: zly,
          }),
          items: [polozka({ name: zly })],
        },
      ],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(x).not.toMatch(/[\u0001\u000B￿]/);
    expect(x).not.toContain("<script>");
    expect(x).not.toContain("]]>");
    expect(x).toContain("A&amp;B &lt;script&gt;");
  });
});
