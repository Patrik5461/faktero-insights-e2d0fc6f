/*
  Colné kódy na vydanej zálohovej faktúre (9. 11. 2026, Patrik: „export
  vydané zálohové faktúry neobsahuje colné kódy“). Zálohová ide do Pohody
  bez DPH (`polozkyZalohyBezDph`), ale kód tovaru KN a príznak prenesenia
  musí niesť rovnako ako faktúra s tou istou položkou — invoice.xsd pozná
  `PDP` a `CodePDP` aj pri „Vydané zálohové faktury“.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildOmegaTxt, buildPohodaInvoiceXml } from "./export.server";
import { buildUniverzalCsv } from "./export-dalsie";

xmlRegisterFsInputProviders();
const url = new URL("./schemy/pohoda/invoice.xsd", import.meta.url);
const xsd = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
function overSchemu(xml: string) {
  const ns = [
    ...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`)),
  ];
  const polozky = [...xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)];
  expect(polozky.length).toBeGreaterThan(0);
  for (const m of polozky) {
    const doc = XmlDocument.fromString(m[1].trim().replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
    try {
      xsd.validate(doc);
    } finally {
      doc.dispose();
    }
  }
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
const nastavenia: any = { predkontacia: "3Fv", predkontaciaZaloha: "3Zv", clenenieDph: "UD", clenenieDphPdp: "UDpdp" };

const zalohova = (o: any = {}) => ({
  id: "zf-1",
  type: "proforma",
  invoice_number: "ZF20260002",
  variable_symbol: "20260002",
  issue_date: "2026-11-09",
  delivery_date: "2026-11-09",
  due_date: "2026-11-23",
  currency: "EUR",
  customer_name: "Odberateľ a.s.",
  customer_country: "SK",
  customer_ico: "35999888",
  customer_dic: "2021999888",
  customer_ic_dph: "SK2021999888",
  payment_method: "bank_transfer",
  ...o,
});

// Oceľ s colným kódom, krajinou pôvodu a hmotnosťou za kus; 3 ks za 100 € bez DPH.
const ocel = (o: any = {}) => ({
  name: "Oceľové profily",
  quantity: 3,
  unit: "ks",
  unit_price: 33.3333,
  vat_rate: 23,
  subtotal: 100,
  vat_amount: 23,
  total: 123,
  colny_kod: "72161000",
  krajina_povodu: "CZ",
  hmotnost_kg: 2,
  ...o,
});
// Položka v tuzemskom prenesení (§ 69 ods. 12) — ako ZF20260002.
const pdp = (o: any = {}) => ({
  name: "Šrot",
  quantity: 1,
  unit: "t",
  unit_price: 500,
  vat_rate: 0,
  subtotal: 500,
  vat_amount: 0,
  total: 500,
  colny_kod: "72044910",
  prenesenie: true,
  ...o,
});

const polozkyXml = (xml: string) => [...xml.matchAll(/<inv:invoiceItem>([\s\S]*?)<\/inv:invoiceItem>/g)].map((m) => m[1]);

describe("vydaná zálohová faktúra — colné kódy v exporte", () => {
  it("Pohoda: kód KN, krajina pôvodu a hmotnosť ako pri faktúre, platné podľa invoice.xsd", () => {
    const x = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      invoices: [
        {
          invoice: zalohova({ subtotal: 100.81, vat_total: 23.19, total: 124 }) as any,
          items: [ocel({ unit_price: 33.6033, subtotal: 100.81, vat_amount: 23.19, total: 124 }) as any],
        },
      ],
    });
    overSchemu(x);
    expect(x).toContain("<inv:invoiceType>issuedAdvanceInvoice</inv:invoiceType>");
    const [p] = polozkyXml(x);
    // Riadok 1 × celá suma (124 € / 3 ks nevychádza na cent) — kód aj hmotnosť riadku ostávajú.
    expect(p).toContain("<inv:quantity>1</inv:quantity>");
    expect(p).toContain("<inv:goodsCode>72161000</inv:goodsCode>");
    expect(p).toContain("<inv:countryOfOrigin>CZ</inv:countryOfOrigin>");
    expect(p).toContain("<inv:ownWeight>6</inv:ownWeight>");
    // Bez prenesenia žiadny príznak PDP.
    expect(p).not.toContain("<inv:PDP>");
  });

  it("Pohoda: položka v prenesení nesie PDP a CodePDP aj na zálohovej, bežná nie", () => {
    const x = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      invoices: [
        {
          invoice: zalohova({ subtotal: 600, vat_total: 23, total: 623 }) as any,
          items: [ocel({ quantity: 1, unit_price: 100 }) as any, pdp() as any],
        },
      ],
    });
    overSchemu(x);
    const [bezna, vPreneseni] = polozkyXml(x);
    expect(bezna).not.toContain("<inv:PDP>");
    expect(bezna).toContain("<inv:goodsCode>72161000</inv:goodsCode>");
    expect(vPreneseni).toContain("<inv:PDP>true</inv:PDP>");
    expect(vPreneseni).toContain("<inv:CodePDP>7204</inv:CodePDP>");
    expect(vPreneseni).toContain("<inv:goodsCode>72044910</inv:goodsCode>");
    // Zálohová ostáva bez DPH, členenia aj KV.
    expect(x).toContain("<inv:rateVAT>none</inv:rateVAT>");
    expect(x).not.toContain("<inv:classificationVAT>");
    expect(x).not.toContain("<inv:classificationKVDPH>");
  });

  it("Pohoda: zálohová celá v tuzemskom prenesení — PDP a kód tovaru na položke", () => {
    const x = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      invoices: [
        {
          invoice: zalohova({ reverse_charge: true, reverse_charge_type: "domestic_69", subtotal: 500, vat_total: 0, total: 500 }) as any,
          items: [pdp({ prenesenie: false }) as any],
        },
      ],
    });
    overSchemu(x);
    const [p] = polozkyXml(x);
    expect(p).toContain("<inv:PDP>true</inv:PDP>");
    expect(p).toContain("<inv:CodePDP>7204</inv:CodePDP>");
  });

  it("Pohoda: dodanie do EÚ (reverse_charge eu) nedostane tuzemský príznak PDP, kód KN áno", () => {
    const x = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      invoices: [
        {
          invoice: zalohova({
            reverse_charge: true,
            reverse_charge_type: "eu_goods",
            customer_country: "CZ",
            customer_ic_dph: "CZ27123456",
            subtotal: 100,
            vat_total: 0,
            total: 100,
          }) as any,
          items: [ocel({ vat_rate: 0, vat_amount: 0, total: 100, quantity: 1, unit_price: 100 }) as any],
        },
      ],
    });
    overSchemu(x);
    const [p] = polozkyXml(x);
    expect(p).not.toContain("<inv:PDP>");
    expect(p).toContain("<inv:goodsCode>72161000</inv:goodsCode>");
    expect(p).toContain("<inv:countryOfDestination>CZ</inv:countryOfDestination>");
  });

  it("Omega (KROS): preddavková faktúra má colný sadzobník v R02", () => {
    const t = buildOmegaTxt({
      company: firma,
      invoices: [{ invoice: zalohova({ subtotal: 100, vat_total: 23, total: 123 }) as any, items: [ocel() as any] }],
    });
    const r02 = t.split("\r\n").find((r) => r.startsWith("R02"))!;
    expect(r02.split("\t")[15]).toBe("72161000");
  });

  it("univerzálne CSV: stĺpec Colné kódy pri zálohovej", () => {
    const csv = buildUniverzalCsv({
      company: firma,
      invoices: [{ invoice: zalohova({ subtotal: 100, vat_total: 23, total: 123 }) as any, items: [ocel() as any] }],
    } as any);
    expect(csv).toContain("72161000");
  });
});
