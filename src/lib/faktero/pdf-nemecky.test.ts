/**
 * Nemecké PDF faktúry nesmie mať slovenské zvyšky — „PDP“, „Uhradené“,
 * „OPRAVNÝ DOKLAD“. Text sa číta z hotového PDF cez pdf.js, tak ako ho
 * uvidí odberateľ.
 */
import { describe, it, expect } from "vitest";
import { generateInvoicePdfBytes } from "./pdf-generator.server";
import { hodnotyMailu, jazykFaktury, predvolenyMailFaktury } from "./email-jazyk";

async function textPdf(b: Uint8Array): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: b }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    text += c.items.map((x: any) => x.str).join(" ") + "\n";
  }
  return text.replace(/\s+/g, " ");
}

const firma = {
  name: "Muster GmbH",
  country: "DE",
  street: "Hauptstraße 5",
  city: "München",
  zip: "80331",
  dic: "143/123/45678",
  ic_dph: "DE123456789",
  iban: "DE89370400440532013000",
  vat_payer: true,
  vat_scheme: "de_regel",
};
const faktura = {
  invoice_number: "RE-1",
  type: "regular",
  status: "issued",
  issue_date: "2026-10-15",
  delivery_date: "2026-10-14",
  due_date: "2026-10-29",
  currency: "EUR",
  subtotal: 1000,
  vat_total: 0,
  total: 1000,
  customer_name: "Kunde AG",
  customer_country: "DE",
};
const polozky = [
  {
    name: "Bauleistung",
    quantity: 1,
    unit: "ks",
    unit_price: 1000,
    vat_rate: 19,
    subtotal: 1000,
    vat_amount: 0,
    total: 1000,
  },
];
const pdf = (inv: any, firm: any = firma) =>
  generateInvoicePdfBytes({ company: firm, invoice: inv, items: polozky } as any).then(textPdf);

describe("nemecké PDF faktúry", () => {
  it("prenesenie § 13b: „RC“ a „USt. (Reverse-Charge)“ namiesto PDP", async () => {
    const t = await pdf({ ...faktura, reverse_charge: true, reverse_charge_type: "domestic_69" });
    expect(t).toContain("RECHNUNG");
    expect(t).toContain("USt. (Reverse-Charge)");
    expect(t).toContain("§ 13b UStG");
    expect(t).not.toMatch(/PDP/);
  });

  it("zaplatená faktúra: „Bezahlt am“ s nemeckým dátumom", async () => {
    const t = await pdf({
      ...faktura,
      status: "paid",
      paid_at: "2026-10-20T08:00:00Z",
      vat_total: 190,
      total: 1190,
    });
    expect(t).toContain("Bezahlt am 20.10.2026");
    expect(t).not.toMatch(/Uhraden/);
  });

  it("trojstranný obchod: veta § 25b UStG", async () => {
    const t = await pdf({
      ...faktura,
      reverse_charge: true,
      reverse_charge_type: "eu_b2b",
      eu_plnenie: "trojstranny",
    });
    expect(t).toContain("Dreiecksgeschäft gemäß § 25b UStG");
    expect(t).toContain("Die Steuer schuldet der letzte Abnehmer");
  });

  it("Kleinunternehmer s dodaním do EÚ: len veta § 19, bez RC a bez § 4 Nr. 1b", async () => {
    const t = await pdf(
      { ...faktura, reverse_charge: true, reverse_charge_type: "eu_b2b", eu_plnenie: "tovar" },
      { ...firma, vat_payer: false, vat_scheme: "de_kleinunternehmer" },
    );
    expect(t).toContain("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.");
    expect(t).not.toContain("§ 4 Nr. 1b");
    expect(t).not.toContain("Reverse-Charge");
  });

  it("opravný doklad má nadpis v jazyku dokladu", async () => {
    const t = await pdf({ ...faktura, oprava_25a: true });
    expect(t).toContain("BERICHTIGUNGSBELEG");
    expect(t).not.toContain("OPRAVNÝ DOKLAD");
  });
});

describe("predvolený e-mail v jazyku dokladu", () => {
  it("nemecká firma bez jazyka na faktúre → nemecký mail s nemeckým dátumom a sumou", () => {
    const j = jazykFaktury({ language: null }, { country: "DE" });
    expect(j).toBe("de");
    expect(predvolenyMailFaktury(j).predmet).toBe("Rechnung {invoice_number}");
    expect(hodnotyMailu({ total: 1297, currency: "EUR", due_date: "2026-10-29" }, j)).toEqual({
      total: "1.297,00\u00A0€",
      due_date: "29.10.2026",
    });
  });
  it("slovenský doklad ostáva so slovenským textom", () => {
    const j = jazykFaktury({ language: "sk" }, { country: "DE" });
    expect(predvolenyMailFaktury(j)).toEqual({
      predmet: "Faktúra {invoice_number}",
      text: "V prílohe posielame faktúru {invoice_number}.",
    });
  });
});
