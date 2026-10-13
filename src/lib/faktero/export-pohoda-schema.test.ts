/*
  Vystavené faktúry do Pohody proti oficiálnej schéme Stormware
  (schemy/pohoda/invoice.xsd, verzia 2) — vrátane funkcií pridaných neskôr:
  colné údaje (intrastatItem), prenesenie na položke, zľava, dobropis kladne,
  cudzia mena a viac sadzieb.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";

// invoice.xsd importuje type.xsd a ďalšie — libxml ich musí vedieť načítať zo súborov.
xmlRegisterFsInputProviders();
import { buildPohodaInvoiceXml } from "./export.server";

const validator = XsdValidator.fromDoc(
  XmlDocument.fromBuffer(readFileSync(new URL("./schemy/pohoda/invoice.xsd", import.meta.url)), {
    url: new URL("./schemy/pohoda/invoice.xsd", import.meta.url).href,
  }),
);

/** Každý `inv:invoice` z dataPacku samostatne proti invoice.xsd. */
function chybySchemy(xml: string): string[] {
  const ns = [...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`);
  const chyby: string[] = [];
  for (const m of xml.matchAll(/<inv:invoice\b[^>]*>[\s\S]*?<\/inv:invoice>/g)) {
    const prvok = m[0].replace(/^<inv:invoice\b/, `<inv:invoice ${[...new Set(ns)].join(" ")}`);
    const doc = XmlDocument.fromString(prvok);
    try {
      validator.validate(doc);
    } catch (e: any) {
      chyby.push(String(e?.message ?? e));
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}

const company: any = {
  name: "Export s.r.o.",
  ico: "12345678",
  dic: "2120000000",
  ic_dph: "SK2120000000",
  vat_payer: true,
  country: "SK",
  street: "Hlavná 1",
  city: "Nitra",
  zip: "94901",
  iban: "SK3112000000198742637541",
};
const zaklad: any = {
  id: "f1",
  type: "regular",
  invoice_number: "2026101",
  issue_date: "2026-10-10",
  delivery_date: "2026-10-10",
  due_date: "2026-10-24",
  currency: "EUR",
  customer_name: "Buyer GmbH",
  customer_ico: "999",
  customer_country: "DE",
  variable_symbol: "2026101",
  payment_method: "bank_transfer",
};

describe("export vystavených faktúr do Pohody — schéma Stormware", () => {
  it("colné údaje položky idú ako intrastatItem a XML je platné", () => {
    const x = buildPohodaInvoiceXml({
      company,
      invoices: [
        {
          invoice: { ...zaklad, subtotal: 250, vat_total: 0, total: 250 },
          items: [
            {
              name: "Smartfón",
              quantity: 2,
              unit: "ks",
              unit_price: 125,
              vat_rate: 0,
              subtotal: 250,
              vat_amount: 0,
              total: 250,
              colny_kod: "85171300",
              krajina_povodu: "CN",
              hmotnost_kg: 0.25,
            },
          ] as any,
        },
      ],
    });
    expect(x).toContain("<inv:goodsCode>85171300</inv:goodsCode>");
    expect(x).toContain("<inv:countryOfOrigin>CN</inv:countryOfOrigin>");
    expect(x).toContain("<inv:countryOfDestination>DE</inv:countryOfDestination>");
    expect(x).toContain("<inv:ownWeight>0.5</inv:ownWeight>");
    expect(chybySchemy(x)).toEqual([]);
  });

  it("zmiešaná faktúra (PDP na položke, zľava, dve sadzby), dobropis a cudzia mena — platné XML", () => {
    const x = buildPohodaInvoiceXml({
      company,
      invoices: [
        {
          invoice: {
            ...zaklad,
            customer_country: "SK",
            customer_ic_dph: "SK2020000000",
            subtotal: 1700,
            vat_total: 250,
            total: 1950,
          },
          items: [
            {
              name: "Montáž",
              quantity: 1,
              unit: "ks",
              unit_price: 1000,
              vat_rate: 23,
              subtotal: 1000,
              vat_amount: 230,
              total: 1230,
              discount_percent: 0,
            },
            {
              name: "Kniha",
              quantity: 1,
              unit: "ks",
              unit_price: 200,
              vat_rate: 10,
              subtotal: 200,
              vat_amount: 20,
              total: 220,
            },
            {
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
          ] as any,
        },
        {
          invoice: {
            ...zaklad,
            id: "f2",
            type: "credit_note",
            invoice_number: "D2026001",
            subtotal: -100,
            vat_total: -23,
            total: -123,
          },
          items: [
            {
              name: "Vrátenie",
              quantity: -1,
              unit: "ks",
              unit_price: 100,
              vat_rate: 23,
              subtotal: -100,
              vat_amount: -23,
              total: -123,
            },
          ] as any,
        },
        {
          invoice: {
            ...zaklad,
            id: "f3",
            invoice_number: "2026102",
            currency: "USD",
            exchange_rate: 1.08,
            subtotal: 100,
            vat_total: 0,
            total: 100,
          },
          items: [
            {
              name: "Licencia",
              quantity: 1,
              unit: "ks",
              unit_price: 100,
              vat_rate: 0,
              subtotal: 100,
              vat_amount: 0,
              total: 100,
            },
          ] as any,
        },
      ],
    });
    expect(chybySchemy(x)).toEqual([]);
  });

  it("kontrola schémy chybu naozaj chytí (neprepustí neznámy prvok)", () => {
    const x = buildPohodaInvoiceXml({
      company,
      invoices: [
        {
          invoice: { ...zaklad, subtotal: 10, vat_total: 0, total: 10 },
          items: [
            {
              name: "A",
              quantity: 1,
              unit: "ks",
              unit_price: 10,
              vat_rate: 0,
              subtotal: 10,
              vat_amount: 0,
              total: 10,
            },
          ] as any,
        },
      ],
    }).replace("<inv:quantity>", "<inv:nezmysel>1</inv:nezmysel><inv:quantity>");
    expect(chybySchemy(x).length).toBeGreaterThan(0);
  });
});
