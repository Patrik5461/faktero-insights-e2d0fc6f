import { describe, expect, it } from "vitest";
import { mapToEN16931 } from "./en16931.server";
import { generatePeppolBisXml } from "./xml.server";
import { pdfPrijatejEfaktury, prilozenePdf, ublNaPdfVstup } from "./nahlad.server";

const firma: any = {
  name: "Dodávateľ s.r.o.",
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
const faktura: any = {
  invoice_number: "FA2026123",
  type: "regular",
  issue_date: "2026-10-12",
  due_date: "2026-10-26",
  currency: "EUR",
  variable_symbol: "2026123",
  subtotal: 1500,
  vat_total: 230,
  total: 1730,
  customer_name: "Odberateľ a.s.",
  customer_ico: "43291067",
  customer_dic: "5843291067",
  customer_ic_dph: "SK5843291067",
  customer_country: "SK",
  customer_street: "Dlhá 5",
  customer_city: "Trnava",
  customer_zip: "91701",
};
const polozky: any[] = [
  {
    position: 1,
    name: "Montáž",
    description: "Výjazd a práca",
    quantity: 2,
    unit: "hod",
    unit_price: 500,
    vat_rate: 23,
    subtotal: 1000,
    vat_amount: 230,
    total: 1230,
  },
  {
    position: 2,
    name: "Oceľ",
    quantity: 1,
    unit: "ks",
    unit_price: 500,
    vat_rate: 0,
    subtotal: 500,
    vat_amount: 0,
    total: 500,
    prenesenie: true,
    colny_kod: "72142000",
  },
];
const xml = generatePeppolBisXml(
  mapToEN16931({ company: firma, invoice: faktura, items: polozky }),
).xml;

describe("náhľad prijatej eFaktúry", () => {
  it("z UBL prečíta dodávateľa, odberateľa, položky a súčty", () => {
    const v = ublNaPdfVstup(xml);
    expect(v.company.name).toBe("Dodávateľ s.r.o.");
    expect(v.company.ic_dph).toBe("SK4286179504");
    expect(v.company.iban).toBe("SK3112000000198742637541");
    expect(v.invoice.customer_name).toBe("Odberateľ a.s.");
    expect(v.invoice.invoice_number).toBe("FA2026123");
    expect(v.invoice.total).toBe(1730);
    expect(v.items).toHaveLength(2);
    expect(v.items[0]).toMatchObject({ name: "Montáž", quantity: 2, vat_rate: 23, subtotal: 1000 });
    expect(v.items[1]).toMatchObject({ name: "Oceľ", prenesenie: true, colny_kod: "72142000" });
  });

  it("vyrobí PDF, keď odosielateľ žiadne nepriložil", async () => {
    expect(prilozenePdf(xml)).toBeNull();
    const { bajty, prilozene } = await pdfPrijatejEfaktury(xml);
    expect(prilozene).toBe(false);
    expect(Buffer.from(bajty.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("priložené PDF použije namiesto vykreslenia", async () => {
    const pdf = Buffer.from("%PDF-1.4 test").toString("base64");
    const s = xml.replace(
      "<cac:AccountingSupplierParty>",
      `<cac:AdditionalDocumentReference><cbc:ID>1</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="f.pdf">${pdf}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference><cac:AccountingSupplierParty>`,
    );
    const { bajty, prilozene } = await pdfPrijatejEfaktury(s);
    expect(prilozene).toBe(true);
    expect(Buffer.from(bajty).toString()).toBe("%PDF-1.4 test");
  });
});
