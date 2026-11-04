/*
  Zálohová faktúra (vydaná aj prijatá) nie je účtovný doklad: export do
  Pohody ju pustí bez predkontácie a členení a XML ich nenesie (hotfix
  4. 11. 2026 — ZF20260001 PALIERA vrátená z Pohody a „zaúčtovaná“ sa nedala
  vyviezť). Bežná faktúra bez predkontácie ostáva zastavená.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildPohodaExpensesXml, POHODA_XML } from "./export.server";
import { prekazkaDokladu, prekazkaVydanej } from "./pohoda-kontrola";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { isAccountingDocument } from "./uctovny-doklad";

xmlRegisterFsInputProviders();
const url = new URL("./schemy/pohoda/invoice.xsd", import.meta.url);
const xsd = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
function platne(xml: string): boolean {
  const ns = [
    ...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`)),
  ];
  for (const m of xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)) {
    const doc = XmlDocument.fromString(m[1].trim().replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
    try {
      xsd.validate(doc);
    } finally {
      doc.dispose();
    }
  }
  return true;
}

// ZF20260001 PALIERA s.r.o. → SFC, s.r.o. tak, ako je v databáze (4. 11. 2026).
const paliera: any = {
  id: "ee86eb5f-57b7-445a-9b3c-8e6058a905ca",
  name: "PALIERA s.r.o.",
  ico: "54613124",
  dic: "2121733614",
  ic_dph: "SK2121733614",
  country: "SK",
  vat_payer: true,
  vat_scheme: "sk_4",
  pohoda_odkaz_na_pdf: true,
};
const zf: any = {
  id: "632af8a3-3184-4bf7-89a3-1c029a82801d",
  company_id: paliera.id,
  type: "proforma",
  status: "paid",
  invoice_number: "ZF20260001",
  variable_symbol: "20260001",
  issue_date: "2026-11-02",
  delivery_date: "2026-11-02",
  due_date: "2026-11-16",
  currency: "EUR",
  intro_note: "Fakturujeme Vám",
  notes: "",
  customer_name: "SFC, s.r.o.",
  customer_street: "Račianska 17",
  customer_city: "Bratislava - mestská časť Nové Mesto",
  customer_zip: "831 02",
  customer_country: "SK",
  customer_ico: "53297474",
  customer_dic: "2121372693",
  customer_ic_dph: "SK2121372693",
  payment_method: "bank_transfer",
  payment_iban: "SK2909000000005220542779",
  subtotal: 1,
  vat_total: 0.23,
  total: 1.23,
  reverse_charge: false,
  rounding_mode: "per_document",
  pohoda_verzia: 1,
  // Po vrátení z Pohody „zaúčtovaná“ bez predkontácie — to export zastavilo.
  zauctovane_at: "2026-11-04T11:54:43.62+00:00",
  pohoda_predkontacia: null,
  pohoda_clenenie_dph: null,
  kv_clenenie: null,
  rozuctovanie: null,
};
const zfPolozky: any[] = [
  {
    id: "93e08e15-5df1-4c7b-b3c3-7595e81ee006",
    invoice_id: zf.id,
    name: "test",
    unit: "ks",
    quantity: 1,
    unit_price: 1,
    subtotal: 1,
    vat_rate: 23,
    vat_amount: 0.23,
    total: 1.23,
    discount_percent: 0,
    position: 0,
    prenesenie: false,
  },
];
// Nastavenia PALIERY (nastaveniaFaktur) — žiadne predvolené kódy.
const nastPaliera: any = {};

// XML, ktoré odišlo do Pohody 2. 11. 2026 (export_jobs 9aaeb039…) — pred regresiou.
const PRED_REGRESIOU = `<?xml version="1.0" encoding="utf-8"?>
<dat:dataPack id="FAKTERO" ico="54613124" application="Faktero" version="2.0" note="Export z Faktero"
  xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
  xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd"
  xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">
  <dat:dataPackItem id="632af8a3-3184-4bf7-89a3-1c029a82801d" version="2.0">
    <inv:invoice version="2.0">
      <inv:invoiceHeader>
        <inv:invoiceType>issuedAdvanceInvoice</inv:invoiceType>
        <inv:number><typ:numberRequested>ZF20260001</typ:numberRequested></inv:number>
        <inv:symVar>20260001</inv:symVar>
        <inv:date>2026-11-02</inv:date>
        <inv:dateTax>2026-11-02</inv:dateTax>
        <inv:dateDue>2026-11-16</inv:dateDue>
        <inv:text>Fakturujeme Vám</inv:text>
        <inv:partnerIdentity>
          <typ:address>
            <typ:company>SFC, s.r.o.</typ:company>
            <typ:street>Račianska 17</typ:street>
            <typ:city>Bratislava - mestská časť Nové Mesto</typ:city>
            <typ:zip>831 02</typ:zip>
            <typ:country><typ:ids>SK</typ:ids></typ:country>
            <typ:ico>53297474</typ:ico>
            <typ:dic>2121372693</typ:dic>
            <typ:icDph>SK2121372693</typ:icDph>
          </typ:address>
        </inv:partnerIdentity>
        <inv:paymentType><typ:paymentType>draft</typ:paymentType></inv:paymentType>
      </inv:invoiceHeader>
      <inv:invoiceDetail>
        <inv:invoiceItem>
          <inv:text>test</inv:text>
          <inv:quantity>1</inv:quantity>
          <inv:unit>ks</inv:unit>
          <inv:payVAT>false</inv:payVAT>
          <inv:rateVAT>high</inv:rateVAT>
          <inv:homeCurrency>
            <typ:unitPrice>1.00</typ:unitPrice>
            <typ:price>1.00</typ:price>
            <typ:priceVAT>0.23</typ:priceVAT>
            <typ:priceSum>1.23</typ:priceSum>
          </inv:homeCurrency>
        </inv:invoiceItem>
      </inv:invoiceDetail>
      <inv:invoiceSummary>
        <inv:roundingDocument>none</inv:roundingDocument>
        <inv:roundingVAT>none</inv:roundingVAT>
        <inv:homeCurrency>
          <typ:priceNone>0.00</typ:priceNone>
          <typ:price3>0.00</typ:price3>
          <typ:price3VAT>0.00</typ:price3VAT>
          <typ:priceLow>0.00</typ:priceLow>
          <typ:priceLowVAT>0.00</typ:priceLowVAT>
          <typ:priceHigh>1.00</typ:priceHigh>
          <typ:priceHighVAT>0.23</typ:priceHighVAT>
          <typ:round><typ:priceRound>0.00</typ:priceRound></typ:round>
        </inv:homeCurrency>
      </inv:invoiceSummary>
    </inv:invoice>
  </dat:dataPackItem>
</dat:dataPack>`;

const UCTOVNE = ["<inv:accounting>", "<inv:classificationVAT>", "<inv:classificationKVDPH>"];

describe("isAccountingDocument — jediné miesto pre účtovné typy", () => {
  it("účtujú sa faktúry, dobropisy, ťarchopisy, daňové doklady k platbe, prijaté faktúry a bločky", () => {
    for (const t of ["regular", "credit_note", "debit_note", "advance_payment"])
      expect(isAccountingDocument(t)).toBe(true);
    for (const t of ["receivedInvoice", "receivedCreditNotice", "danovyDokladKPlatbe"])
      expect(isAccountingDocument(t)).toBe(true);
    // Bloček typ nemá.
    expect(isAccountingDocument(undefined)).toBe(true);
  });
  it("zálohové faktúry, ponuky, objednávky a koncepty sa neúčtujú", () => {
    for (const t of ["proforma", "issuedAdvanceInvoice", "receivedAdvanceInvoice", "quote", "order"])
      expect(isAccountingDocument(t)).toBe(false);
    expect(isAccountingDocument("regular", "draft")).toBe(false);
  });
});

describe("Zálohová faktúra do Pohody bez predkontácie", () => {
  it("ZF20260001: kontrola ju pustí aj zaúčtovanú bez predkontácie", () => {
    expect(prekazkaVydanej(zf, zfPolozky, paliera, nastPaliera)).toBeNull();
  });

  it("ZF20260001: XML je rovnaké ako pred regresiou, bez účtovných elementov a podľa invoice.xsd", () => {
    const r = POHODA_XML.build({
      company: paliera,
      invoices: [{ invoice: zf, items: zfPolozky }],
      nastavenia: nastPaliera,
    }) as { content: string; preskocene?: string[] };
    expect(r.preskocene).toEqual([]);
    // Jediný rozdiel: po vrátení z Pohody ide doklad ako ďalšia verzia (`id-verzia`, pohoda_verzia = 1).
    expect(r.content).toBe(
      PRED_REGRESIOU.replace(`id="${zf.id}"`, `id="${zf.id}-1"`),
    );
    for (const el of UCTOVNE) expect(r.content).not.toContain(el);
    expect(platne(r.content)).toBe(true);
  });

  it("vydaná zálohová s kódmi (aj pri položkách, rozúčtovaná) ide bez predkontácie, členenia DPH aj KV", () => {
    const sKodmi = {
      ...zf,
      pohoda_predkontacia: "3Fv",
      pohoda_clenenie_dph: "UD",
      kv_clenenie: "A1",
      rozuctovanie: [
        { sadzba: 23, zaklad: 0.5, dph: 0.115, predkontacia: "3Fv", clenenie: "UD", kv: "A1" },
        { sadzba: 23, zaklad: 0.5, dph: 0.115, predkontacia: "3Fs", clenenie: "UD", kv: "A1" },
      ],
    };
    const polozky = zfPolozky.map((p) => ({
      ...p,
      pohoda_predkontacia: "3Fs",
      pohoda_clenenie_dph: "UD",
      kv_clenenie: "A1",
    }));
    const nast = {
      predkontacia: "3Fv",
      predkontaciaZaloha: "3Zv",
      clenenieDph: "UD",
      kvFaktura: "A1",
    };
    expect(prekazkaVydanej(sKodmi, polozky, paliera, nast)).toBeNull();
    const { content } = POHODA_XML.build({
      company: paliera,
      invoices: [{ invoice: sKodmi, items: polozky }],
      nastavenia: nast as any,
    }) as { content: string };
    expect(content).toContain("<inv:invoiceType>issuedAdvanceInvoice</inv:invoiceType>");
    for (const el of UCTOVNE) expect(content).not.toContain(el);
    expect(content).not.toContain("Rozúčtovať");
    expect(platne(content)).toBe(true);
  });

  it("hromadný export: zálohová prejde, bežná faktúra bez predkontácie sa vyradí s rovnakou hláškou", () => {
    const fa = { ...zf, id: "fa-1", type: "regular", invoice_number: "FA20260009" };
    const r = POHODA_XML.build({
      company: paliera,
      invoices: [
        { invoice: zf, items: zfPolozky },
        { invoice: fa, items: zfPolozky.map((p) => ({ ...p, invoice_id: "fa-1" })) },
      ],
      nastavenia: nastPaliera,
    }) as { content: string; preskocene?: string[] };
    expect(r.preskocene).toEqual([
      "FA20260009 — zaúčtovaná bez predkontácie — doplňte ju v zaúčtovaní faktúry",
    ]);
    expect(r.content).toContain("ZF20260001");
  });

  it("bežná faktúra bez predkontácie je stále zablokovaná", () => {
    const fa = { ...zf, type: "regular", invoice_number: "FA20260009" };
    expect(prekazkaVydanej(fa, zfPolozky, paliera, nastPaliera)).toBe(
      "FA20260009 — zaúčtovaná bez predkontácie — doplňte ju v zaúčtovaní faktúry",
    );
    expect(() =>
      POHODA_XML.build({
        company: paliera,
        invoices: [{ invoice: fa, items: zfPolozky }],
        nastavenia: nastPaliera,
      }),
    ).toThrow(
      "Do Pohody sa nedá vyviezť nič z vybraného: FA20260009 — zaúčtovaná bez predkontácie — doplňte ju v zaúčtovaní faktúry",
    );
  });

  it("prijatá zálohová zaúčtovaná s kódmi z pravidla: kontrola ju pustí a XML ich nenesie", () => {
    const d = prijataAkoDoklad({
      id: "pz-1",
      company_id: paliera.id,
      type: "proforma",
      status: "received",
      invoice_number: "26ZF-00035",
      issue_date: "2026-11-02",
      due_date: "2026-11-16",
      currency: "EUR",
      supplier_name: "Dodávateľ s.r.o.",
      supplier_ico: "36123456",
      amount_without_vat: 100,
      vat_amount: 23,
      amount_total: 123,
      pohoda_predkontacia: "518000 321000",
      pohoda_clenenie_dph: "PD",
      kv_clenenie: "B2",
      zauctovane_at: "2026-11-04T10:00:00Z",
    });
    expect(prekazkaDokladu(d as any, paliera, {})).toBeNull();
    const x = buildPohodaExpensesXml({ company: paliera, nastavenia: {} as any, doklady: [d] });
    expect(x).toContain("<inv:invoiceType>receivedAdvanceInvoice</inv:invoiceType>");
    for (const el of UCTOVNE) expect(x).not.toContain(el);
  });
});
