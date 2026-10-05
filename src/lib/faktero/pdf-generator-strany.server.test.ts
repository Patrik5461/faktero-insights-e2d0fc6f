import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateInvoicePdfBytes } from "./pdf-generator.server";

/*
  Bežná faktúra s dvoma-tromi položkami sa musí zmestiť na jednu stranu aj s
  textom nad položkami, popisom položky, prenesením daňovej povinnosti a
  dvoma riadkami pod číslom (samofaktúra + dobropis). Platobné údaje osamelé
  na druhej strane vyzerajú ako chyba a pri tlači sa strácajú.
*/

const dodavatel = {
  name: "QA Šrot s.r.o.",
  ico: "55667788",
  dic: "2122334455",
  ic_dph: "SK2122334455",
  street: "Priemyselná 5",
  city: "Nitra",
  zip: "949 01",
  country: "SK",
  email: "info@example.com",
  iban: "SK3112000000198742637541",
};
const odberatel = {
  customer_name: "Faktero Demo s.r.o.",
  customer_ico: "55555555",
  customer_dic: "2120000000",
  customer_ic_dph: "SK2120000000",
  customer_street: "Skúšobná 1",
  customer_city: "Trnava",
  customer_zip: "917 01",
  customer_country: "SK",
  customer_email: "demo@example.com",
};

async function strany(bajty: Uint8Array) {
  return (await PDFDocument.load(bajty)).getPageCount();
}

describe("faktúra na jednu stranu", () => {
  it("samofaktúra-dobropis s prenesením, textom nad položkami a popisom", async () => {
    const b = await generateInvoicePdfBytes({
      company: dodavatel,
      invoice: {
        ...odberatel,
        invoice_number: "SF20260002",
        type: "credit_note",
        opravuje_cislo: "SF20260001",
        samofakturacia: true,
        issue_date: "2026-10-05",
        delivery_date: "2026-10-05",
        due_date: "2026-10-19",
        variable_symbol: "20260002",
        payment_method: "prevod",
        currency: "EUR",
        intro_note: "Dobropis k faktúre SF20260001",
        reverse_charge: true,
        reverse_charge_type: "domestic_69",
        subtotal: -45,
        vat_total: 0,
        total: -45,
      },
      items: [
        {
          name: "Železný šrot",
          description: "Dodacie listy 101–104",
          quantity: -200,
          unit: "kg",
          unit_price: 0.25,
          discount_percent: 10,
          vat_rate: 0,
          total: -45,
        },
      ],
    });
    expect(await strany(b)).toBe(1);
  });

  it("dve položky s popisom, prenesenie a text nad položkami", async () => {
    const b = await generateInvoicePdfBytes({
      company: dodavatel,
      invoice: {
        ...odberatel,
        invoice_number: "SF20260001",
        samofakturacia: true,
        issue_date: "2026-10-05",
        delivery_date: "2026-10-05",
        due_date: "2026-10-19",
        variable_symbol: "20260001",
        payment_method: "prevod",
        currency: "EUR",
        intro_note: "Fakturujeme Vám výkup kovového šrotu za september 2026.",
        reverse_charge: true,
        reverse_charge_type: "domestic_69",
        subtotal: 266.66,
        vat_total: 0,
        total: 266.66,
      },
      items: [1, 2].map((i) => ({
        name: `Šrot ${i}`,
        description: `Dodací list ${i}`,
        quantity: 100,
        unit: "kg",
        unit_price: 1.3333,
        vat_rate: 0,
        total: 133.33,
      })),
    });
    expect(await strany(b)).toBe(1);
  });

  it("bežná faktúra s textom nad položkami, platobným QR a odkazom Faktúra online", async () => {
    const b = await generateInvoicePdfBytes({
      company: { ...dodavatel, vat_payer: true },
      invoice: {
        ...odberatel,
        invoice_number: "20260004",
        issue_date: "2026-10-05",
        delivery_date: "2026-10-05",
        due_date: "2026-10-19",
        variable_symbol: "20260004",
        payment_method: "bank_transfer",
        currency: "EUR",
        intro_note: "Fakturujeme Vám montážne práce podľa objednávky č. 15/2026.",
        subtotal: 300,
        vat_total: 69,
        total: 369,
      },
      items: [
        { name: "Montáž", description: "Výjazd a práca", quantity: 10, unit: "h", unit_price: 25, vat_rate: 23, total: 307.5 },
        { name: "Materiál", quantity: 1, unit: "ks", unit_price: 50, vat_rate: 23, total: 61.5 },
      ],
      verejnyOdkaz: "https://www.faktero.sk/faktura/52376f872a9b372e59b67e3cf58ee86b",
    });
    expect(await strany(b)).toBe(1);
  });
});
