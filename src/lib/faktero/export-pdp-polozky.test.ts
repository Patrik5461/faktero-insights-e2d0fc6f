/*
  Prenesenie len na niektorých položkách a colné údaje v exportoch do
  Omegy, Money S3 a ABRA Flexi (vystavené faktúry).
*/
import { describe, expect, it } from "vitest";
import { buildMoneyS3Xml, buildOmegaTxt } from "./export.server";
import { buildFlexiXml } from "./export-dalsie";

const company: any = {
  name: "Stavby s.r.o.",
  ico: "12345678",
  dic: "2120000000",
  ic_dph: "SK2120000000",
  vat_payer: true,
  country: "SK",
  street: "Hlavná 1",
  city: "Nitra",
  zip: "94901",
};
const invoice: any = {
  id: "f1",
  type: "regular",
  invoice_number: "2026201",
  issue_date: "2026-10-10",
  delivery_date: "2026-10-10",
  due_date: "2026-10-24",
  currency: "EUR",
  customer_name: "Odberateľ s.r.o.",
  customer_ico: "44444444",
  customer_ic_dph: "SK2020000000",
  customer_country: "SK",
  subtotal: 1500,
  vat_total: 230,
  total: 1730,
};
const items: any[] = [
  {
    name: "Montáž",
    quantity: 1,
    unit: "ks",
    unit_price: 1000,
    vat_rate: 23,
    subtotal: 1000,
    vat_amount: 230,
    total: 1230,
  },
  {
    name: "Betonárska oceľ",
    quantity: 2,
    unit: "t",
    unit_price: 250,
    vat_rate: 0,
    subtotal: 500,
    vat_amount: 0,
    total: 500,
    prenesenie: true,
    colny_kod: "72142000",
    hmotnost_kg: 1000,
  },
];

describe("Omega TXT — prenesenie na položke", () => {
  const txt = buildOmegaTxt({ company, invoices: [{ invoice, items }], preskocene: [] });
  const riadky = txt.split("\r\n");
  const r01 = riadky.find((r) => r.startsWith("R01"))!.split("\t");
  const r02 = riadky.filter((r) => r.startsWith("R02")).map((r) => r.split("\t"));
  it("základ v prenesení je v stĺpci „Neobsahuje“, nie v nulovej sadzbe", () => {
    expect(r01[9]).toBe("0,00"); // Základ 0
    expect(r01[10]).toBe("500,00"); // Základ Neobsahuje
  });
  it("položka v prenesení: sadzba X, oddiel KV A2, colný sadzobník a kód tovaru KV", () => {
    const pdp = r02[1];
    expect(pdp[5]).toBe("X");
    expect(pdp[15]).toBe("72142000");
    expect(pdp[53]).toBe("A2");
    expect(pdp[55]).toBe("72142000");
    expect(r02[0][5]).toBe("V");
    expect(r02[0][53] ?? "").toBe("");
  });
});

describe("Money S3 — prenesenie a hmotnosť", () => {
  it("KodDPH z nastavenia len pri položke v prenesení, hmotnosť v neskladovej položke", () => {
    const { xml } = buildMoneyS3Xml({
      company,
      invoices: [{ invoice, items }],
      clenenieDphPdp: "PDP",
    });
    const polozky = xml.split("<Polozka>").slice(1);
    expect(polozky[0]).not.toContain("<KodDPH>");
    expect(polozky[1]).toContain("<KodDPH>PDP</KodDPH>");
    expect(polozky[1]).toMatch(
      /<NesklPolozka>\s*<Hmotnost>1000<\/Hmotnost>\s*<Protizapis>0<\/Protizapis>\s*<\/NesklPolozka>/,
    );
  });
  it("bez nastaveného členenia sa KodDPH nevymýšľa", () => {
    const { xml } = buildMoneyS3Xml({ company, invoices: [{ invoice, items }] });
    expect(xml).not.toContain("<KodDPH>");
  });
});

describe("ABRA Flexi — prenesenie na položke", () => {
  it("clenDph z nastavenia len pri položke v prenesení", () => {
    const { xml } = buildFlexiXml({
      invoices: [{ invoice, items }],
      krajina: "SK",
      clenenieDphPdp: "PDP",
    });
    const polozky = xml.split("<faktura-vydana-polozka>").slice(1);
    expect(polozky[0]).not.toContain("<clenDph>");
    expect(polozky[1]).toContain("<clenDph>code:PDP</clenDph>");
  });
});
