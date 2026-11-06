import { describe, expect, it } from "vitest";
import { generateInvoicePdfBytes } from "./pdf-generator.server";

/*
  Bežný doklad (do desiatich-dvanástich položiek) sa musí zmestiť na jednu
  stranu A4 aj s rekapituláciou DPH, poznámkou, zápisom v OR a QR na platbu.
  Dlhší doklad smie mať viac strán, ale QR na platbu nikdy neostane sám na
  novej strane — ide vždy spolu so súčtami a platobnými údajmi (2026-11-06:
  QR sa presúval na druhú stranu už pri piatich položkách).
*/

/** Text jednotlivých strán PDF. */
async function strany(b: Uint8Array): Promise<string[]> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: b }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    out.push(
      c.items
        .map((x: any) => x.str)
        .join(" ")
        .replace(/\s+/g, " "),
    );
  }
  return out;
}

const firma = {
  name: "PALIERA s.r.o.",
  ico: "54613124",
  dic: "2121733614",
  ic_dph: "SK2121733614",
  street: "Športová 707/43",
  city: "Zavar",
  zip: "919 26",
  country: "SK",
  vat_payer: true,
  email: "ekonom@paliera.sk",
  phone: "+421907702422",
  website: "www.paliera.com",
  iban: "SK2909000000005220542779",
  swift: "GIBASKBX",
  registracia_text: "Obchodný register Okresného súdu Trnava, oddiel: Sro, vložka č. 51630/T",
};

function faktura(pocet: number, navyse: Record<string, unknown> = {}) {
  const items = Array.from({ length: pocet }, (_, i) => {
    const sadzba = i % 3 === 0 ? 5 : 23;
    return {
      name: `Tovar č. ${i + 1}`,
      quantity: 1,
      unit: "ks",
      unit_price: 100,
      vat_rate: sadzba,
      subtotal: 100,
      vat_amount: sadzba,
      total: 100 + sadzba,
    };
  });
  const subtotal = items.reduce((a, x) => a + x.subtotal, 0);
  const vat = items.reduce((a, x) => a + x.vat_amount, 0);
  return {
    company: firma,
    vystavil: "Patrik Paliera",
    invoice: {
      invoice_number: "FA20260100",
      type: "regular",
      status: "issued",
      issue_date: "2026-11-05",
      delivery_date: "2026-11-05",
      due_date: "2026-11-19",
      variable_symbol: "20260100",
      payment_method: "bank_transfer",
      currency: "EUR",
      customer_name: "nuu s.r.o.",
      customer_street: "Gazdovská 1901/7B",
      customer_zip: "900 41",
      customer_city: "Rovinka",
      customer_country: "SK",
      customer_ico: "55042872",
      customer_dic: "2121851754",
      customer_ic_dph: "SK2121851754",
      intro_note: "Fakturujeme Vám tovar podľa objednávky.",
      notes: "Ďakujeme za objednávku.",
      subtotal,
      vat_total: vat,
      total: subtotal + vat,
      ...navyse,
    },
    items,
  } as any;
}

const QR = "QR PLATBA PREVODOM";

describe("PDF na jednu stranu", () => {
  it("faktúra s desiatimi položkami, dvoma sadzbami, poznámkou, OR a QR má jednu stranu", async () => {
    const s = await strany(await generateInvoicePdfBytes(faktura(10)));
    expect(s).toHaveLength(1);
    expect(s[0]).toContain(QR);
    expect(s[0]).toContain("Ďakujeme za objednávku.");
    expect(s[0]).toContain("vložka č. 51630/T");
  });

  it("faktúra s dvanástimi položkami bez textu nad položkami má jednu stranu", async () => {
    const s = await strany(await generateInvoicePdfBytes(faktura(12, { intro_note: null, notes: null })));
    expect(s).toHaveLength(1);
    expect(s[0]).toContain(QR);
  });

  it("faktúra s prenesením daňovej povinnosti a desiatimi položkami má jednu stranu", async () => {
    const vstup = faktura(10, { reverse_charge: true, reverse_charge_type: "domestic_69", notes: null });
    vstup.items = vstup.items.map((x: any) => ({ ...x, vat_rate: 0, vat_amount: 0, total: x.subtotal }));
    vstup.invoice.vat_total = 0;
    vstup.invoice.total = vstup.invoice.subtotal;
    const s = await strany(await generateInvoicePdfBytes(vstup));
    expect(s).toHaveLength(1);
    expect(s[0]).toContain(QR);
    expect(s[0]).toMatch(/prenesen/i);
  });

  it("zálohová faktúra a cenová ponuka s desiatimi položkami majú jednu stranu", async () => {
    const zalohova = await strany(await generateInvoicePdfBytes(faktura(10, { type: "proforma" })));
    expect(zalohova).toHaveLength(1);
    expect(zalohova[0]).toContain(QR);
    const ponuka = await strany(
      await generateInvoicePdfBytes({
        ...faktura(10),
        documentLabel: "CENOVÁ PONUKA",
        numberLabel: "č. Q20260001",
        hidePayment: true,
        metaOverride: [
          ["Dátum vystavenia", "2026-11-05"],
          ["Platnosť do", "2026-12-05"],
          ["Mena", "EUR"],
        ],
      }),
    );
    expect(ponuka).toHaveLength(1);
  });

  it("QR nikdy nie je sám na strane — vždy so súčtami a platobnými údajmi", async () => {
    for (let n = 1; n <= 45; n++) {
      const s = await strany(await generateInvoicePdfBytes(faktura(n)));
      const sQr = s.filter((t) => t.includes(QR));
      expect(sQr, `${n} položiek`).toHaveLength(1);
      expect(sQr[0], `${n} položiek`).toContain("SPOLU K ÚHRADE");
      expect(sQr[0], `${n} položiek`).toContain("PLATOBNÉ ÚDAJE");
      expect(sQr[0], `${n} položiek`).toContain("SK2909000000005220542779");
      // Pri desiatich a menej položkách je všetko na jednej strane.
      if (n <= 10) expect(s, `${n} položiek`).toHaveLength(1);
    }
  }, 60000);
});
