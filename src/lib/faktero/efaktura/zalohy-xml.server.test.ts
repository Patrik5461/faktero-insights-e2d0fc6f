import { describe, expect, it } from "vitest";
import { mapToEN16931 } from "./en16931.server";
import { generatePeppolBisXml } from "./xml.server";
import { parseEfakturaEnvelope } from "./inbound.server";
import { teloOdoslania, zalohyNaOdoslanie } from "./epostak-telo";

/*
  Výstupy týchto prípadov boli overené validátorom ePoštáka
  (UBL XSD + EN 16931 + Peppol BIS schematron) 2026-10-08.
*/
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
const zdanena = [
  { zaloha: "ZF2026001", doklad: "DP2026001", vs: null, suma: 615, riadky: [{ sadzba: 23, zaklad: 500, dph: 115 }] },
];
const hodnota = (xml: string, tag: string) =>
  Number(xml.match(new RegExp(`<cbc:${tag}[^>]*>([^<]+)</cbc:${tag}>`))?.[1]);

describe("záloha na vyúčtovaní v UBL", () => {
  it("zdanenú zálohu odpočíta záporným riadkom — daň je len rozdiel", () => {
    const r = generatePeppolBisXml(
      mapToEN16931({ company: firma, invoice: faktura(), items: [polozka()], zalohy: zdanena }),
    );
    expect(r.validationErrors).toEqual([]);
    expect(hodnota(r.xml, "TaxExclusiveAmount")).toBe(500);
    expect(hodnota(r.xml, "TaxAmount")).toBe(115);
    expect(hodnota(r.xml, "PayableAmount")).toBe(615);
    expect(r.xml).toContain('<cbc:InvoicedQuantity unitCode="C62">-1</cbc:InvoicedQuantity>');
    expect(r.xml).toContain("Odpočet zálohy DP2026001 (k ZF2026001)");
    expect(r.xml).not.toContain("PrepaidAmount");
  });

  it("nezdanenú zálohu aj starý stĺpec bez väzby odráta len zo sumy na úhradu", () => {
    for (const zalohy of [[{ ...zdanena[0], doklad: null, riadky: [] }], undefined]) {
      const r = generatePeppolBisXml(
        mapToEN16931({ company: firma, invoice: faktura({ advance_amount: 615 }), items: [polozka()], zalohy }),
      );
      expect(r.validationErrors).toEqual([]);
      expect(hodnota(r.xml, "TaxAmount")).toBe(230);
      expect(hodnota(r.xml, "PrepaidAmount")).toBe(615);
      expect(hodnota(r.xml, "PayableAmount")).toBe(615);
    }
  });

  it("prijatá faktúra so zálohou má sumu s DPH, nie len zvyšok na úhradu", () => {
    const xml = generatePeppolBisXml(
      mapToEN16931({ company: firma, invoice: faktura({ advance_amount: 615 }), items: [polozka()] }),
    ).xml;
    const p = parseEfakturaEnvelope(xml);
    expect(p.total).toBe(1230);
    expect(p.vatTotal).toBe(230);
    expect(p.prepaid).toBe(615);
    expect(p.payable).toBe(615);
  });
});

describe("adresy a neplatiteľ v UBL", () => {
  it("obe strany majú 0245 s DIČ — bez zdvojenej schémy a bez 9944", () => {
    const xml = generatePeppolBisXml(
      mapToEN16931({
        company: firma,
        profile: { peppol_participant_id: "0245:4286179504", peppol_scheme: "0245" },
        invoice: faktura(),
        items: [polozka()],
      }),
    ).xml;
    expect(xml).toContain('<cbc:EndpointID schemeID="0245">4286179504</cbc:EndpointID>');
    expect(xml).toContain('<cbc:EndpointID schemeID="0245">5843291067</cbc:EndpointID>');
    expect(xml).not.toContain("9944");
  });

  it("neplatiteľ je mimo rozsahu DPH (O) — bez sadzby a bez IČ DPH", () => {
    const xml = generatePeppolBisXml(
      mapToEN16931({
        company: { ...firma, ic_dph: null, vat_payer: false },
        invoice: faktura({ vat_total: 0, total: 1000 }),
        items: [polozka({ vat_rate: 0, vat_amount: 0, total: 1000 })],
      }),
    ).xml;
    expect(xml).toContain("<cbc:ID>O</cbc:ID>");
    expect(xml).not.toContain("<cbc:Percent>");
    expect(xml).not.toContain("SK5843291067");
    expect(xml).toContain("Dodávateľ nie je platiteľ DPH");
  });
});

describe("zálohy pre ePoštáka", () => {
  it("zdanená ide po sadzbách s dokladom k platbe, nezdanená len sumou", () => {
    expect(
      zalohyNaOdoslanie([
        { zaloha: "ZF1", doklad: "DP1", vs: null, suma: 400, riadky: [{ sadzba: 23, zaklad: 300, dph: 69 }, { sadzba: 5, zaklad: 29.52, dph: 1.48 }] },
        { zaloha: "ZF2", doklad: null, vs: null, suma: 200, riadky: [] },
      ]),
    ).toEqual([
      { advanceInvoiceRef: "ZF1", taxDocumentRef: "DP1", amountWithoutVat: 300, vatAmount: 69, amountWithVat: 369, vatRate: 23 },
      { advanceInvoiceRef: "ZF1", taxDocumentRef: "DP1", amountWithoutVat: 29.52, vatAmount: 1.48, amountWithVat: 31, vatRate: 5 },
      { advanceInvoiceRef: "ZF2", amountWithVat: 200 },
    ]);
  });

  it("so zálohami z väzby neposiela prepaidAmount, bez nich áno", () => {
    const zaklad: any = {
      druh: "invoice", cislo: "1", vystavena: "2026-10-08", splatnost: null, dodanie: null, mena: "EUR",
      vs: null, iban: null, poznamka: null, buyerReference: "1", protistranaPeppolId: "0245:5843291067",
      protistranaNazov: "x", zaplatenaZaloha: 615,
      polozky: [{ name: "A", quantity: 1, unit_price: 1000, vat_rate: 23 }],
    };
    const s = teloOdoslania({ ...zaklad, zalohy: zdanena });
    expect(s.prepaidAmount).toBeUndefined();
    expect(s.prepayments).toHaveLength(1);
    const bez = teloOdoslania(zaklad);
    expect(bez.prepaidAmount).toBe(615);
    expect(bez.prepayments).toBeUndefined();
  });
});
