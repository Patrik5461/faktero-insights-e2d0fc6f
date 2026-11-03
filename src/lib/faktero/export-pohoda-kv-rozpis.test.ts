/*
  Pohoda XML (súbor aj dávka konektora): členenie KV DPH a rozpis DPH po
  sadzbách pri každom type prijatého dokladu — bloček (pokladňa, Ostatné
  záväzky, interný doklad, prijatá faktúra), rozúčtovaný bloček, prijatá
  faktúra s položkami, cudzia mena, dobropis, daňový doklad k platbe —
  vždy s 2–3 sadzbami a proti schémam Stormware (version_2).

  Body 2 a 3 zo zadania 3. 11. 2026: „Členenie KV DPH pri bločkoch zahrnúť
  do exportu.“ a „Pri exportoch musí exportovať aj základ a aj rozpis DPH.“
*/
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import { buildPohodaDavkaXml, buildPohodaExpensesXml, buildPohodaInvoiceXml } from "./export.server";
import { prijataAkoDoklad } from "./prijate-do-pohody";

xmlRegisterFsInputProviders();

const SCHEMY: Record<string, string> = { inv: "invoice.xsd", vch: "voucher.xsd", int: "intDoc.xsd" };
const validatory = new Map<string, XsdValidator>();
function validator(prefix: string): XsdValidator {
  const v = validatory.get(prefix);
  if (v) return v;
  const url = new URL(`./schemy/pohoda/${SCHEMY[prefix]}`, import.meta.url);
  const novy = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(url), { url: url.href }));
  validatory.set(prefix, novy);
  return novy;
}

function chybySchemy(xml: string): string[] {
  const ns = [...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`))];
  const chyby: string[] = [];
  const polozky = [...xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)];
  if (!polozky.length) chyby.push("balík je prázdny");
  for (const m of polozky) {
    const vnutro = m[1].trim();
    const prefix = /^<(\w+):/.exec(vnutro)?.[1] ?? "";
    if (!SCHEMY[prefix]) {
      chyby.push(`neznáma agenda ${prefix}`);
      continue;
    }
    const doc = XmlDocument.fromString(vnutro.replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
    try {
      validator(prefix).validate(doc);
    } catch (e: any) {
      chyby.push(`${prefix}: ${String(e?.message ?? e)} ${JSON.stringify(e?.details ?? "").slice(0, 400)}`);
    } finally {
      doc.dispose();
    }
  }
  return chyby;
}

const hodnota = (xml: string, el: string): string | null =>
  new RegExp(`<${el}(?:\\s[^>]*)?>([^<]*)</${el}>`).exec(xml)?.[1] ?? null;
/** Hlavička dokladu (bez položiek) a jednotlivé položky. */
const hlavicka = (xml: string) => /<(\w+):\w+Header>[\s\S]*?<\/\1:\w+Header>/.exec(xml)?.[0] ?? "";
const polozky = (xml: string) => [...xml.matchAll(/<(\w+):\w+Item>[\s\S]*?<\/\1:\w+Item>/g)].map((m) => m[0]);
const kvz = (xml: string) => /<\w+:classificationKVDPH><typ:ids>([^<]*)<\/typ:ids>/.exec(xml)?.[1] ?? null;
const suhrn = (xml: string) => /<(\w+):\w+Summary>[\s\S]*?<\/\1:\w+Summary>/.exec(xml)?.[0] ?? "";
const dokladyZ = (xml: string) => xml.split("<dat:dataPackItem").slice(1);

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
  predkontaciaZaloha: "3Zv",
  clenenieDph: "UD",
  predkontaciaPrijata: "1Fp",
  clenenieDphPrijata: "PD",
  clenenieDphPdpPrijata: "PDpdp",
  predkontaciaDoklady: "1Bl",
  clenenieDphDoklady: "PD",
  pokladna: "HP",
  blockyPodlaPlatby: true,
};

// Bloček s tromi sadzbami (23 / 19 / 5 %) — 2026.
const TRI_SADZBY = [
  { sadzba: 23, zaklad: 100, dph: 23 },
  { sadzba: 19, zaklad: 50, dph: 9.5 },
  { sadzba: 5, zaklad: 20, dph: 1 },
];
const blocek = (o: any = {}) => ({
  id: "exp-1",
  supplier_name: "Potraviny s.r.o.",
  supplier_ico: "31111111",
  supplier_ic_dph: "SK2020000001",
  document_number: "O-123",
  issue_date: "2026-10-04",
  currency: "EUR",
  total_amount: 203.5,
  vat_breakdown: TRI_SADZBY,
  category: "kancelaria",
  payment_method: "hotovost",
  status: "processed",
  ...o,
});

function overTriSadzby(sum: string) {
  expect(hodnota(sum, "typ:priceHigh")).toBe("100.00");
  expect(hodnota(sum, "typ:priceHighVAT")).toBe("23.00");
  expect(hodnota(sum, "typ:priceLow")).toBe("50.00");
  expect(hodnota(sum, "typ:priceLowVAT")).toBe("9.50");
  expect(hodnota(sum, "typ:price3")).toBe("20.00");
  expect(hodnota(sum, "typ:price3VAT")).toBe("1.00");
}

describe("Pohoda — členenie KV DPH bločku v hlavičke aj v položkách", () => {
  it("hotovosť (vch), karta (commitment), prevod (inv), vyúčtovanie (int): KV B3 a tri sadzby", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia,
      doklady: [
        blocek(),
        blocek({ id: "exp-2", payment_method: "karta" }),
        blocek({ id: "exp-3", payment_method: "prevod" }),
        blocek({ id: "exp-4", payment_method: "hotovost", vyuctovanie_id: "vy-1" }),
      ],
    });
    expect(chybySchemy(x)).toEqual([]);
    const [vch, karta, prevod, int] = dokladyZ(x);
    expect(vch).toContain("<vch:voucher ");
    expect(karta).toContain("<inv:invoiceType>commitment</inv:invoiceType>");
    expect(prevod).toContain("<inv:invoiceType>receivedInvoice</inv:invoiceType>");
    expect(int).toContain("<int:intDoc ");
    for (const d of [vch, karta, prevod, int]) {
      expect(kvz(hlavicka(d))).toBe("B3");
      overTriSadzby(suhrn(d));
      // Žiadna suma nespadla do zaokrúhlenia.
      expect(hodnota(suhrn(d), "typ:priceRound")).toBe("0.00");
    }
  });

  it("ručne zadané KV na bločku (B2) má prednosť pred automatickým B3 — hlavička aj položky", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia: { ...nastavenia, polozkyBlockov: true },
      doklady: [
        blocek({
          kv_clenenie: "B2",
          payment_method: "karta",
          items: [
            { name: "Papier", quantity: 1, unit_price: 123, vat_rate: 23, total: 123 },
            { name: "Káva", quantity: 1, unit_price: 59.5, vat_rate: 19, total: 59.5 },
            { name: "Kniha", quantity: 1, unit_price: 21, vat_rate: 5, total: 21 },
          ],
        }),
      ],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(kvz(hlavicka(x))).toBe("B2");
    const p = polozky(x);
    expect(p).toHaveLength(3);
    for (const i of p) expect(kvz(i)).toBe("B2");
    expect(p.map((i) => hodnota(i, "inv:rateVAT"))).toEqual(["high", "low", "third"]);
    overTriSadzby(suhrn(x));
  });

  it("KV na položke bločku (ručne) prebije KV dokladu; položka bez dane členenie nedostane", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia: { ...nastavenia, polozkyBlockov: true },
      doklady: [
        blocek({
          total_amount: 133,
          vat_breakdown: [
            { sadzba: 23, zaklad: 100, dph: 23 },
            { sadzba: 0, zaklad: 10, dph: 0 },
          ],
          items: [
            { name: "Toner", quantity: 1, unit_price: 123, vat_rate: 23, total: 123, kv: "B2" },
            { name: "Kolok", quantity: 1, unit_price: 10, vat_rate: 0, total: 10 },
          ],
        }),
      ],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(kvz(hlavicka(x))).toBe("B3");
    const [toner, kolok] = polozky(x);
    expect(kvz(toner)).toBe("B2");
    expect(kvz(kolok)).toBeNull();
    expect(hodnota(suhrn(x), "typ:priceNone")).toBe("10.00");
    expect(hodnota(suhrn(x), "typ:priceHigh")).toBe("100.00");
  });

  it("„Nezahŕňať“ (X) na doklade: žiadne KV v hlavičke ani v položkách", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia: { ...nastavenia, polozkyBlockov: true },
      doklady: [
        blocek({
          kv_clenenie: "X",
          items: [
            { name: "Papier", quantity: 1, unit_price: 123, vat_rate: 23, total: 123 },
            { name: "Káva", quantity: 1, unit_price: 59.5, vat_rate: 19, total: 59.5 },
            { name: "Kniha", quantity: 1, unit_price: 21, vat_rate: 5, total: 21 },
          ],
        }),
      ],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(x).not.toContain("classificationKVDPH");
  });

  it("rozúčtovaný bloček: KV na každom riadku (vlastné má prednosť), hlavička len pri zhode", () => {
    const rozuctovanie = [
      { predkontacia: "1Bl", clenenie: "PD", sadzba: 23, zaklad: 60, dph: 13.8, text: "Kancelária" },
      { predkontacia: "1Rep", clenenie: "PD", sadzba: 23, zaklad: 40, dph: 9.2, text: "Reprezentácia" },
      { predkontacia: "1Bl", clenenie: "PD", sadzba: 19, zaklad: 50, dph: 9.5 },
      { predkontacia: "1Bl", clenenie: "PD", sadzba: 5, zaklad: 20, dph: 1 },
    ];
    const rovnake = buildPohodaExpensesXml({
      company: firma,
      nastavenia,
      doklady: [blocek({ rozuctovanie, payment_method: "karta" })],
    });
    expect(chybySchemy(rovnake)).toEqual([]);
    expect(hodnota(hlavicka(rovnake), "typ:ids")).toBeTruthy();
    expect(kvz(hlavicka(rovnake))).toBe("B3");
    expect(polozky(rovnake).map(kvz)).toEqual(["B3", "B3", "B3", "B3"]);
    overTriSadzby(suhrn(rovnake));

    const rozne = buildPohodaExpensesXml({
      company: firma,
      nastavenia,
      doklady: [
        blocek({
          rozuctovanie: rozuctovanie.map((r, i) => (i === 1 ? { ...r, kv: "B2" } : r)),
          payment_method: "hotovost",
        }),
      ],
    });
    expect(chybySchemy(rozne)).toEqual([]);
    expect(rozne).toContain("<vch:voucher ");
    expect(kvz(hlavicka(rozne))).toBeNull();
    expect(polozky(rozne).map(kvz)).toEqual(["B3", "B2", "B3", "B3"]);
    overTriSadzby(suhrn(rozne));
  });

  it("bloček kartou v cudzej mene (USD): položky po sadzbách s KV, súhrn v mene", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia,
      doklady: [
        blocek({
          payment_method: "karta",
          currency: "USD",
          exchange_rate: 1.16,
          total_amount: 3083,
          vat_breakdown: [
            { sadzba: 23, zaklad: 2000, dph: 460 },
            { sadzba: 19, zaklad: 500, dph: 95 },
            { sadzba: 0, zaklad: 28, dph: 0 },
          ],
        }),
      ],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(kvz(hlavicka(x))).toBe("B3");
    const p = polozky(x);
    expect(p).toHaveLength(3);
    expect(p.every((i) => i.includes("<inv:foreignCurrency>"))).toBe(true);
    const po = Object.fromEntries(p.map((i) => [hodnota(i, "inv:rateVAT"), i]));
    expect(hodnota(po.high, "typ:priceVAT")).toBe("460.00");
    expect(hodnota(po.low, "typ:priceVAT")).toBe("95.00");
    expect(hodnota(po.none, "typ:price")).toBe("28.00");
    expect([kvz(po.high), kvz(po.low), kvz(po.none)]).toEqual(["B3", "B3", null]);
    expect(hodnota(suhrn(x), "typ:priceSum")).toBe("3083.00");
  });
});

describe("Pohoda — rozpis DPH namiesto sumy spolu", () => {
  it("doklad bez rozpisu (len suma spolu) ide ako základ v nulovej sadzbe, nie ako zaokrúhlenie", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia,
      doklady: [blocek({ vat_breakdown: [], net_amount: null, vat_amount: null, total_amount: 45.2, payment_method: "prevod" })],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(suhrn(x), "typ:priceNone")).toBe("45.20");
    expect(hodnota(suhrn(x), "typ:priceRound")).toBe("0.00");
  });

  it("časť bez DPH (prepitné) ide do základu 0 % aj ako položka; malé zaokrúhlenie ostáva zaokrúhlením", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia: { ...nastavenia, polozkyBlockov: true },
      doklady: [
        blocek({
          id: "tip",
          total_amount: 208.5,
          items: [
            { name: "Jedlo", quantity: 1, unit_price: 123, vat_rate: 23, total: 123 },
            { name: "Nápoj", quantity: 1, unit_price: 59.5, vat_rate: 19, total: 59.5 },
            { name: "Kniha", quantity: 1, unit_price: 21, vat_rate: 5, total: 21 },
          ],
        }),
        blocek({ id: "zaokr", total_amount: 203.52 }),
      ],
    });
    expect(chybySchemy(x)).toEqual([]);
    const [tip, zaokr] = dokladyZ(x);
    overTriSadzby(suhrn(tip));
    expect(hodnota(suhrn(tip), "typ:priceNone")).toBe("5.00");
    expect(hodnota(suhrn(tip), "typ:priceRound")).toBe("0.00");
    const bez = polozky(tip).find((i) => i.includes("Bez DPH"))!;
    expect(hodnota(bez, "vch:rateVAT")).toBe("none");
    expect(hodnota(bez, "typ:price")).toBe("5.00");
    expect(kvz(bez)).toBeNull();
    expect(hodnota(suhrn(zaokr), "typ:priceRound")).toBe("0.02");
    expect(hodnota(suhrn(zaokr), "typ:priceNone")).toBe("0.00");
  });

  it("prijatá faktúra bez súm (len spolu) v cudzej mene: položka bez DPH, nie prázdny detail", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia,
      doklady: [
        prijataAkoDoklad(
          prijata({ currency: "USD", exchange_rate: 1.1, amount_without_vat: 0, vat_amount: 0, amount_total: 80, items: [] }),
        ),
      ],
    });
    expect(chybySchemy(x)).toEqual([]);
    const p = polozky(x);
    expect(p).toHaveLength(1);
    expect(hodnota(p[0], "typ:price")).toBe("80.00");
  });
});

const prijata = (o: any = {}) => ({
  id: "pi-1",
  company_id: "c1",
  type: "regular",
  invoice_number: "2026-778",
  supplier_name: "Dodávateľ s.r.o.",
  supplier_ico: "44111222",
  supplier_ic_dph: "SK2022111222",
  supplier_country: "SK",
  issue_date: "2026-10-05",
  delivery_date: "2026-10-03",
  due_date: "2026-10-19",
  variable_symbol: "2026778",
  currency: "EUR",
  amount_without_vat: 170,
  vat_amount: 33.5,
  amount_total: 203.5,
  payment_method: "prevod",
  pohoda_predkontacia: "1Fp",
  pohoda_clenenie_dph: "PD",
  zauctovane_at: "2026-10-07T10:00:00Z",
  items: [
    { name: "Materiál", quantity: 1, unit_price: 100, vat_rate: 23, total: 100 },
    { name: "Potraviny", quantity: 1, unit_price: 50, vat_rate: 19, total: 50 },
    { name: "Knihy", quantity: 1, unit_price: 20, vat_rate: 5, total: 20 },
  ],
  ...o,
});

describe("Pohoda — prijaté faktúry: KV na položkách a rozpis po sadzbách", () => {
  it("prijatá faktúra s položkami 23/19/5: KV B2 v hlavičke aj na každej položke, vlastné KV položky má prednosť", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia,
      doklady: [
        prijataAkoDoklad(
          prijata({
            items: [
              { name: "Materiál", quantity: 1, unit_price: 100, vat_rate: 23, total: 100 },
              { name: "Potraviny", quantity: 1, unit_price: 50, vat_rate: 19, total: 50, kv: "B3" },
              { name: "Knihy", quantity: 1, unit_price: 20, vat_rate: 5, total: 20 },
            ],
          }),
        ),
      ],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(kvz(hlavicka(x))).toBe("B2");
    expect(polozky(x).map(kvz)).toEqual(["B2", "B3", "B2"]);
    overTriSadzby(suhrn(x));
  });

  it("ručne zadané KV faktúry (B3) ide do hlavičky aj položiek namiesto B2", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia,
      doklady: [prijataAkoDoklad(prijata({ kv_clenenie: "B3" }))],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(kvz(hlavicka(x))).toBe("B3");
    expect(polozky(x).map(kvz)).toEqual(["B3", "B3", "B3"]);
  });

  it("prijatý dobropis s dvomi sadzbami: kladné sumy, KV C2 v hlavičke aj položkách", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia,
      doklady: [
        prijataAkoDoklad(
          prijata({
            id: "pi-d",
            invoice_number: "D-5",
            opravuje_cislo: "2026-778",
            amount_without_vat: -150,
            vat_amount: -32.5,
            amount_total: -182.5,
            items: [
              { name: "Vrátenie materiálu", quantity: 1, unit_price: -100, vat_rate: 23, total: -100 },
              { name: "Vrátenie potravín", quantity: 1, unit_price: -50, vat_rate: 19, total: -50 },
            ],
          }),
        ),
      ],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(hodnota(x, "inv:invoiceType")).toBe("receivedCreditNotice");
    expect(kvz(hlavicka(x))).toBe("C2");
    expect(polozky(x).map(kvz)).toEqual(["C2", "C2"]);
    expect(hodnota(suhrn(x), "typ:priceHigh")).toBe("100.00");
    expect(hodnota(suhrn(x), "typ:priceLowVAT")).toBe("9.50");
  });

  it("prijatá faktúra v cudzej mene bez položiek: položky po sadzbách s DPH a KV", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia,
      doklady: [
        prijataAkoDoklad(
          prijata({
            currency: "USD",
            exchange_rate: 1.1,
            amount_without_vat: 100,
            vat_amount: 23,
            amount_total: 123,
            items: [],
          }),
        ),
      ],
    });
    expect(chybySchemy(x)).toEqual([]);
    const p = polozky(x);
    expect(p).toHaveLength(1);
    expect(hodnota(p[0], "typ:priceVAT")).toBe("23.00");
    expect(kvz(p[0])).toBe("B2");
  });

  it("voľba „položky z rozpisu DPH“: každá sadzba ako položka s KV", () => {
    const x = buildPohodaExpensesXml({
      company: firma,
      nastavenia: { ...nastavenia, export: { polozkyZRozpisu: true } },
      doklady: [blocek({ payment_method: "prevod" })],
    });
    expect(chybySchemy(x)).toEqual([]);
    const p = polozky(x);
    expect(p.map((i) => hodnota(i, "inv:rateVAT")).sort()).toEqual(["high", "low", "third"]);
    expect(p.map(kvz)).toEqual(["B3", "B3", "B3"]);
  });
});

describe("Pohoda — vystavené doklady ako interný doklad a dávka konektora", () => {
  it("daňový doklad k platbe s dvomi sadzbami (int): rozpis a KV A1", () => {
    const x = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      invoices: [
        {
          invoice: {
            id: "dp-1",
            type: "advance_payment",
            invoice_number: "DP2026001",
            issue_date: "2026-10-10",
            delivery_date: "2026-10-08",
            currency: "EUR",
            customer_name: "Odberateľ a.s.",
            customer_ico: "35999888",
            customer_dic: "2021999888",
            customer_ic_dph: "SK2021999888",
            customer_country: "SK",
            subtotal: 150,
            vat_total: 32.5,
            total: 182.5,
          } as any,
          items: [
            { name: "Záloha A", quantity: 1, unit_price: 100, vat_rate: 23, subtotal: 100, vat_amount: 23, total: 123 },
            { name: "Záloha B", quantity: 1, unit_price: 50, vat_rate: 19, subtotal: 50, vat_amount: 9.5, total: 59.5 },
          ] as any,
        },
      ],
    });
    expect(chybySchemy(x)).toEqual([]);
    expect(x).toContain("<int:intDoc ");
    expect(kvz(hlavicka(x))).toBe("A1");
    expect(hodnota(suhrn(x), "typ:priceHigh")).toBe("100.00");
    expect(hodnota(suhrn(x), "typ:priceHighVAT")).toBe("23.00");
    expect(hodnota(suhrn(x), "typ:priceLow")).toBe("50.00");
    expect(hodnota(suhrn(x), "typ:priceLowVAT")).toBe("9.50");
  });

  it("dávka konektora nesie KV a rozpis bločku rovnako ako súbor", () => {
    const x = buildPohodaDavkaXml({
      company: firma,
      nastavenia,
      invoices: [],
      pohyby: [],
      doklady: [blocek({ kv_clenenie: "B2", payment_method: "karta" })],
    } as any);
    expect(chybySchemy(x)).toEqual([]);
    expect(kvz(hlavicka(dokladyZ(x)[0]))).toBe("B2");
    overTriSadzby(suhrn(x));
  });
});
