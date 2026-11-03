/*
  Rozúčtovanie vystavených faktúr (3. 11. 2026): kódy po položkách vrátane
  strediska a činnosti a rozúčtovanie sumy na viac riadkov — rozpis, kontrola,
  export do Pohody proti invoice.xsd a do ostatných programov.
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildPohodaInvoiceXml } from "./export.server";
import {
  chybaUlozenehoRozuctovaniaVystavenej,
  platneRozuctovanieVystavenej,
  prekazkaRozuctovaniaVystavenej,
  rozpisVystavenej,
  znamienkoPoloziekVystavenej,
} from "./rozuctovanie-vystavenej";
import { ocisti, nacitajRozuctovanie } from "./rozuctovanie";
import { prekazkaVydanej } from "./pohoda-kontrola";
import { vystavenaNaUctovanie } from "./zauctovanie-export";

xmlRegisterFsInputProviders();

let validator: XsdValidator | null = null;
function chybySchemy(xml: string): string[] {
  if (!validator) {
    const url = new URL("./schemy/pohoda/invoice.xsd", import.meta.url);
    validator = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
  }
  const ns = [
    ...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`)),
  ];
  const chyby: string[] = [];
  for (const m of xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)) {
    const prvok = m[1].trim().replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`);
    const doc = XmlDocument.fromString(prvok);
    try {
      validator.validate(doc);
    } catch (e: any) {
      chyby.push(`${String(e?.message ?? e)} ${JSON.stringify(e?.details ?? "").slice(0, 400)}`);
    } finally {
      doc.dispose();
    }
  }
  return chyby;
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
const nastavenia: any = {
  predkontacia: "3Fv",
  predkontaciaDobropis: "3Dv",
  predkontaciaZaloha: "3Zv",
  clenenieDph: "UD",
  stredisko: "BA",
};

const polozka = (o: any = {}) => ({
  id: "i1",
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
  issue_date: "2026-10-10",
  delivery_date: "2026-10-08",
  due_date: "2026-10-24",
  currency: "EUR",
  customer_name: "Odberateľ a.s.",
  customer_country: "SK",
  customer_ico: "35999888",
  customer_ic_dph: "SK2021999888",
  payment_method: "bank_transfer",
  intro_note: "Služby za október",
  subtotal: 300,
  vat_total: 51,
  total: 351,
  ...o,
});

const polozky = [
  polozka(),
  polozka({
    id: "i2",
    name: "Materiál",
    quantity: 1,
    unit_price: 100,
    subtotal: 100,
    vat_amount: 23,
    total: 123,
  }),
  polozka({
    id: "i3",
    name: "Kniha",
    quantity: 1,
    unit_price: 100,
    vat_rate: 5,
    subtotal: 100,
    vat_amount: 5,
    total: 105,
  }),
];

const rozuctovanie = [
  {
    predkontacia: "3Fv",
    clenenie: "UD",
    sadzba: 23,
    zaklad: 150,
    dph: 34.5,
    text: "Služby",
    stredisko: "KE",
  },
  {
    predkontacia: "3Fm",
    clenenie: "UD",
    sadzba: 23,
    zaklad: 50,
    dph: 11.5,
    kv: "A1",
    cinnost: "MAT",
  },
  { predkontacia: "3Fv", clenenie: null, sadzba: 5, zaklad: 100, dph: 5 },
];

const pocet = (xml: string, s: string) => xml.split(s).length - 1;

describe("rozúčtovanie vystavenej — rozpis a kontrola", () => {
  it("rozpis po sadzbách z položiek, dobropis kladne, zľava na doklad započítaná", () => {
    expect(rozpisVystavenej(faktura(), polozky)).toEqual([
      { sadzba: 5, zaklad: 100, dph: 5 },
      { sadzba: 23, zaklad: 200, dph: 46 },
    ]);
    const zaporne = polozky.map((p) => ({
      ...p,
      quantity: -p.quantity,
      subtotal: -p.subtotal,
      vat_amount: -p.vat_amount,
      total: -p.total,
    }));
    expect(znamienkoPoloziekVystavenej(zaporne)).toBe(-1);
    expect(rozpisVystavenej(faktura({ type: "credit_note" }), zaporne)).toEqual([
      { sadzba: 5, zaklad: 100, dph: 5 },
      { sadzba: 23, zaklad: 200, dph: 46 },
    ]);
    const r = rozpisVystavenej(faktura({ discount_total: 30 }), polozky);
    expect(r.reduce((a, x) => a + x.zaklad, 0)).toBeCloseTo(270, 2);
  });

  it("platné rozúčtovanie sa použije, nesediace nie a kontrola pred exportom faktúru zastaví", () => {
    expect(platneRozuctovanieVystavenej(faktura({ rozuctovanie }), polozky)).toHaveLength(3);
    const zle = [{ ...rozuctovanie[0], zaklad: 140 }, ...rozuctovanie.slice(1)];
    expect(platneRozuctovanieVystavenej(faktura({ rozuctovanie: zle }), polozky)).toEqual([]);
    expect(chybaUlozenehoRozuctovaniaVystavenej(faktura({ rozuctovanie: zle }), polozky)).toMatch(
      /Súčty nesedia/,
    );
    expect(prekazkaVydanej(faktura({ rozuctovanie: zle }), polozky, firma, nastavenia)).toMatch(
      /rozúčtovanie nesedí s faktúrou/,
    );
    expect(prekazkaVydanej(faktura({ rozuctovanie }), polozky, firma, nastavenia)).toBeNull();
  });

  it("zmiešané prenesenie a colné údaje rozúčtovanie sumou nepustia", () => {
    expect(
      prekazkaRozuctovaniaVystavenej(faktura(), [
        polozka(),
        polozka({ prenesenie: true, vat_amount: 0 }),
      ]),
    ).toMatch(/prenesenie/);
    expect(prekazkaRozuctovaniaVystavenej(faktura(), [polozka({ colny_kod: "84713000" })])).toMatch(
      /Intrastat/,
    );
    expect(
      prekazkaRozuctovaniaVystavenej(faktura({ reverse_charge: true }), [
        polozka({ prenesenie: true }),
      ]),
    ).toBeNull();
  });

  it("stredisko a činnosť riadku sa uložia a načítajú, prázdne sa nepridajú", () => {
    const o = ocisti(rozuctovanie as any);
    expect(o[0]).toMatchObject({ stredisko: "KE" });
    expect(o[1]).toMatchObject({ cinnost: "MAT", kv: "A1" });
    expect("stredisko" in o[2]).toBe(false);
    expect(nacitajRozuctovanie(o)[1].cinnost).toBe("MAT");
  });
});

describe("rozúčtovanie vystavenej — Pohoda (invoice.xsd)", () => {
  it("rozúčtovaná faktúra: riadky namiesto položiek, hlavička Rozúčtovať, stredisko a činnosť na riadkoch", () => {
    const x = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      invoices: [{ invoice: faktura({ rozuctovanie }), items: polozky }],
    } as any);
    expect(chybySchemy(x)).toEqual([]);
    expect(pocet(x, "<inv:invoiceItem>")).toBe(3);
    expect(x).toContain("<inv:invoiceHeader>");
    expect(x).toMatch(/<inv:invoiceHeader>[\s\S]*<inv:accounting><typ:ids>Rozúčtovať<\/typ:ids>/);
    expect(x).toContain("<inv:text>Služby</inv:text>");
    expect(x).toContain("<inv:accounting><typ:ids>3Fm</typ:ids></inv:accounting>");
    expect(x).toContain("<inv:centre><typ:ids>KE</typ:ids></inv:centre>");
    expect(x).toContain("<inv:activity><typ:ids>MAT</typ:ids></inv:activity>");
    // Riadok bez strediska dostane predvolené stredisko firmy.
    expect(pocet(x, "<inv:centre><typ:ids>BA</typ:ids></inv:centre>")).toBeGreaterThanOrEqual(2);
    expect(x).toContain("<inv:classificationKVDPH><typ:ids>A1</typ:ids></inv:classificationKVDPH>");
    // Súhrn DPH ostáva z položiek.
    expect(x).toContain("<typ:priceHigh>200.00</typ:priceHigh>");
    expect(x).toContain("<typ:price3>100.00</typ:price3>");
  });

  it("rozúčtovaný dobropis ide s kladnými sumami a predkontáciou z riadkov", () => {
    const zaporne = polozky.map((p) => ({
      ...p,
      quantity: -p.quantity,
      subtotal: -p.subtotal,
      vat_amount: -p.vat_amount,
      total: -p.total,
    }));
    const x = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      invoices: [
        {
          invoice: faktura({
            type: "credit_note",
            invoice_number: "DB1",
            subtotal: -300,
            vat_total: -51,
            total: -351,
            rozuctovanie,
          }),
          items: zaporne,
        },
      ],
    } as any);
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toContain("<inv:invoiceType>issuedCreditNotice</inv:invoiceType>");
    expect(x).toContain("<typ:price>150.00</typ:price>");
    expect(x).not.toMatch(/<typ:price>-/);
  });

  it("kódy po položkách: stredisko a činnosť položky, Rozúčtovať aj pri rovnakej predkontácii", () => {
    const x = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      invoices: [
        {
          invoice: faktura({ stredisko: "KE" }),
          items: [
            polozka({ stredisko: "ZA", cinnost: "SERVIS" }),
            polozka({ id: "i2" }),
            polozky[2],
          ],
        },
      ],
    } as any);
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toMatch(/<inv:invoiceHeader>[\s\S]*<inv:accounting><typ:ids>Rozúčtovať<\/typ:ids>/);
    expect(x).toContain("<inv:centre><typ:ids>ZA</typ:ids></inv:centre>");
    expect(x).toContain("<inv:activity><typ:ids>SERVIS</typ:ids></inv:activity>");
    expect(pocet(x, "<inv:accounting><typ:ids>3Fv</typ:ids></inv:accounting>")).toBe(3);
  });

  it("rovnaké stredisko na všetkých položkách ide do hlavičky, nie Rozúčtovať", () => {
    const x = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      invoices: [{ invoice: faktura(), items: polozky.map((p) => ({ ...p, stredisko: "PO" })) }],
    } as any);
    expect(chybySchemy(x)).toEqual([]);
    expect(x).not.toContain("Rozúčtovať");
    expect(pocet(x, "<inv:centre>")).toBe(1);
    expect(x).toContain("<inv:centre><typ:ids>PO</typ:ids></inv:centre>");
  });

  it("nesediace rozúčtovanie sa do XML nedostane (faktúru zastaví kontrola)", () => {
    const zle = [{ ...rozuctovanie[0], zaklad: 1 }, ...rozuctovanie.slice(1)];
    const x = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      invoices: [{ invoice: faktura({ rozuctovanie: zle }), items: polozky }],
    } as any);
    expect(x).not.toContain("3Fm");
  });
});

describe("rozúčtovanie vystavenej — ostatné programy (DokladUctovania)", () => {
  it("riadky zaúčtovania z rozúčtovania, KV položky prebíja KV faktúry", () => {
    const d = vystavenaNaUctovanie(
      faktura({ rozuctovanie, kv_clenenie: "A1" }),
      polozky,
      nastavenia,
    );
    expect(d.rozuctovany).toBe(true);
    expect(d.riadky.map((r) => [r.predkontacia, r.sadzba, r.zaklad])).toEqual([
      ["3Fv", 23, 150],
      ["3Fm", 23, 50],
      ["3Fv", 5, 100],
    ]);
    const bez = vystavenaNaUctovanie(
      faktura({ kv_clenenie: "A1" }),
      [polozka({ kv_clenenie: "D2" }), polozky[1]],
      nastavenia,
    );
    expect(bez.riadky.map((r) => r.kv)).toEqual(["D2", "A1"]);
  });
});
