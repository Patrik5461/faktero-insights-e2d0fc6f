/*
  Odpočet zálohy do Pohody — audit exportov 14. 11. 2026:
   - K2: odpočet zálohy zdanenej vo viacerých sadzbách ručný export ticho
     vynechal (PALIERA FA20260006 bez odpočtu 3,23 € zo ZF20260002);
   - V1: konektor a balík počítali sadzbu odpočtu z pomeru DPH/základ
     zálohovej faktúry (23 % + 0 % → 8 % → priehradka 19 %);
   - V3: daňový doklad k platbe v cudzej mene vypadol zo súboru, ale export
     ho zapísal ako odovzdaný;
   - S4: odpočet nezdanenej zálohy na prijatej faktúre sa do Pohody neposielal.
  Výsledné XML sa overuje proti schémam Stormware (e2e/schemy/pohoda).
*/
import { describe, expect, it } from "vitest";
import { buildPohodaExpensesXml, buildPohodaInvoiceXml, pohodaPrekazka, POHODA_XML } from "./export.server";
import { prijataAkoDoklad } from "./prijate-do-pohody";
import { prekazkaOdpoctuPohody, zalohyPrePohodu, type OdpocetZalohy } from "./zalohy-odpocty";

const XML_LIB = "../../../e2e/lib/xml.mjs";
async function chybaXsd(xml: string): Promise<string | null> {
  const { overXsd, SCHEMY } = await import(/* @vite-ignore */ XML_LIB);
  return overXsd(xml, SCHEMY.pohoda);
}

/** Hodnota prvého výskytu elementu. */
function hodnota(xml: string, el: string): string | null {
  const m = new RegExp(`<${el}(?:\\s[^>]*)?>([^<]*)</${el}>`).exec(xml);
  return m ? m[1] : null;
}
const odpocty = (xml: string) =>
  [...xml.matchAll(/<inv:invoiceAdvancePaymentItem>[\s\S]*?<\/inv:invoiceAdvancePaymentItem>/g)].map((m) => m[0]);

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
};

// PALIERA FA20260006: vyúčtovanie s odpočtom 3,23 € zo ZF20260002, doklad
// k platbe 260800003 má riadky 1,00 + 0,23 DPH (23 %) a 2 × 1,00 (0 %).
const odpocetPaliera: OdpocetZalohy[] = [
  {
    zaloha: "ZF20260002",
    zalohaId: "zf-2",
    doklad: "260800003",
    vs: null,
    suma: 3.23,
    riadky: [
      { sadzba: 23, zaklad: 1, dph: 0.23 },
      { sadzba: 0, zaklad: 2, dph: 0 },
    ],
  },
];
const faktura = (o: any = {}) => ({
  id: "fa-6",
  type: "regular",
  invoice_number: "FA20260006",
  issue_date: "2026-11-05",
  delivery_date: "2026-11-05",
  due_date: "2026-11-19",
  currency: "EUR",
  customer_name: "Odberateľ s.r.o.",
  customer_ico: "35999888",
  customer_ic_dph: "SK2021999888",
  subtotal: 3,
  vat_total: 0.23,
  total: 3.23,
  ...o,
});
const polozky = [
  { name: "Tovar", quantity: 1, unit: "ks", unit_price: 1, vat_rate: 23, subtotal: 1, vat_amount: 0.23, total: 1.23 },
  { name: "Tovar oslobodený", quantity: 2, unit: "ks", unit_price: 1, vat_rate: 0, subtotal: 2, vat_amount: 0, total: 2 },
];

describe("zalohyPrePohodu — jeden výpočet pre súbor, balík aj konektor", () => {
  it("zdanená záloha vo viacerých sadzbách = položka na sadzbu (K2)", () => {
    expect(zalohyPrePohodu(odpocetPaliera)).toEqual([
      { cislo: "ZF20260002", sadzba: 23, zaklad: 1, dph: 0.23 },
      { cislo: "ZF20260002", sadzba: 0, zaklad: 2, dph: 0 },
    ]);
  });

  it("nezdanená bez DPH, zmes zdanenej a nezdanenej po zálohách, každá so svojím číslom", () => {
    expect(zalohyPrePohodu([{ zaloha: "ZF1", doklad: null, vs: null, suma: 61.5, riadky: [] }])).toEqual([
      { cislo: "ZF1", sadzba: 0, zaklad: 61.5, dph: 0 },
    ]);
    expect(
      zalohyPrePohodu([
        { zaloha: "ZF1", doklad: "DP1", vs: null, suma: 123, riadky: [{ sadzba: 23, zaklad: 100, dph: 23 }] },
        { zaloha: "ZF2", doklad: null, vs: null, suma: 50, riadky: [] },
      ]),
    ).toEqual([
      { cislo: "ZF1", sadzba: 23, zaklad: 100, dph: 23 },
      { cislo: "ZF2", sadzba: 0, zaklad: 50, dph: 0 },
    ]);
  });

  it("číslo zálohovej v Pohode (konektor) má prednosť pred naším", () => {
    expect(zalohyPrePohodu(odpocetPaliera, (o) => (o.zalohaId === "zf-2" ? "ZF-POH-7" : null))?.[0].cislo).toBe(
      "ZF-POH-7",
    );
  });

  it("nezapísateľný odpočet = null a závažná chyba, nie tiché vynechanie", () => {
    const bezRiadkov: OdpocetZalohy[] = [{ zaloha: "ZF1", doklad: "DP1", vs: null, suma: 10, riadky: [] }];
    expect(zalohyPrePohodu(bezRiadkov)).toBeNull();
    expect(prekazkaOdpoctuPohody({ invoice_number: "FA1", _odpocty: bezRiadkov })).toMatch(/^FA1 — odpočet zálohy/);
    // Starý odpočet bez väzby na zálohovú faktúru.
    expect(prekazkaOdpoctuPohody({ invoice_number: "FA2", advance_amount: 360, _odpocty: null })).toMatch(
      /^FA2 — odpočet zálohy 360\.00 bez väzby/,
    );
    // Odpočty nenačítané (iný volajúci) — nič sa netvrdí.
    expect(prekazkaOdpoctuPohody({ invoice_number: "FA3", advance_amount: 360 })).toBeNull();
    // Doklad k platbe nesie v advance_amount vlastnú sumu.
    expect(prekazkaOdpoctuPohody({ invoice_number: "DDP", type: "advance_payment", advance_amount: 3.23, _odpocty: null })).toBeNull();
    expect(prekazkaOdpoctuPohody({ invoice_number: "FA4", _odpocty: odpocetPaliera })).toBeNull();
  });

  it("pohodaPrekazka zastaví faktúru s nezapísateľným odpočtom — ručný export ju ukáže ako závažnú", () => {
    const inv: any = faktura({ advance_amount: 3.23, _odpocty: null });
    expect(pohodaPrekazka(inv, firma, { items: polozky as any, nastavenia })).toMatch(/bez väzby na zálohovú faktúru/);
    // Bez potvrdenia ju súbor vynechá a nahlási (export ju neoznačí).
    const s = POHODA_XML.build({
      company: firma,
      nastavenia,
      invoices: [
        { invoice: inv, items: polozky as any },
        { invoice: faktura({ id: "fa-7", invoice_number: "FA20260007", _odpocty: null }) as any, items: polozky as any },
      ],
    }) as any;
    expect(s.preskocene).toHaveLength(1);
    expect(s.preskocene[0]).toMatch(/^FA20260006 — /);
    expect(s.content).not.toContain("FA20260006");
  });
});

describe("Pohoda XML — odpočet zálohy vo viacerých sadzbách (K2, V1)", () => {
  it("PALIERA FA20260006: dve položky odpočtu, súhrn po sadzbách na nule, platné podľa XSD", async () => {
    const x = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      zalohy: { "fa-6": zalohyPrePohodu(odpocetPaliera)! },
      invoices: [{ invoice: faktura({ _odpocty: odpocetPaliera }) as any, items: polozky as any }],
    });
    expect(await chybaXsd(x)).toBeNull();
    const o = odpocty(x);
    expect(o).toHaveLength(2);
    expect(o[0]).toContain("<typ:number>ZF20260002</typ:number>");
    expect(hodnota(o[0], "inv:rateVAT")).toBe("high");
    expect(hodnota(o[0], "typ:price")).toBe("-1.00");
    expect(hodnota(o[0], "typ:priceVAT")).toBe("-0.23");
    expect(hodnota(o[1], "inv:rateVAT")).toBe("none");
    expect(hodnota(o[1], "typ:price")).toBe("-2.00");
    // Daň zo zálohy sa už priznala dokladom k platbe — vyúčtovanie má nulu.
    const suhrn = /<inv:invoiceSummary>[\s\S]*?<\/inv:invoiceSummary>/.exec(x)![0];
    expect(hodnota(suhrn, "typ:priceHigh")).toBe("0.00");
    expect(hodnota(suhrn, "typ:priceHighVAT")).toBe("0.00");
    expect(hodnota(suhrn, "typ:priceNone")).toBe("0.00");
    // Žiadna priehradka 19 % (V1: zmiešaná sadzba 8 % padla do „low“).
    expect(x).not.toContain("<inv:rateVAT>low</inv:rateVAT>");
    expect(hodnota(suhrn, "typ:priceLow")).not.toBe("-2.99");
  });

  it("dve zálohové faktúry — každá položka odkazuje na svoju zálohu", async () => {
    const zoz: OdpocetZalohy[] = [
      { zaloha: "ZF1", doklad: "DP1", vs: null, suma: 61.5, riadky: [{ sadzba: 23, zaklad: 50, dph: 11.5 }] },
      { zaloha: "ZF2", doklad: null, vs: null, suma: 20, riadky: [] },
    ];
    const x = buildPohodaInvoiceXml({
      company: firma,
      nastavenia,
      zalohy: { f: zalohyPrePohodu(zoz)! },
      invoices: [
        {
          invoice: faktura({ id: "f", invoice_number: "FA9", subtotal: 100, vat_total: 23, total: 123, _odpocty: zoz }) as any,
          items: [{ ...polozky[0], quantity: 1, unit_price: 100, subtotal: 100, vat_amount: 23, total: 123 }] as any,
        },
      ],
    });
    expect(await chybaXsd(x)).toBeNull();
    const o = odpocty(x);
    expect(o.map((p) => hodnota(p, "typ:number"))).toEqual(["ZF1", "ZF2"]);
    expect(hodnota(x, "typ:priceHigh")).toBe("50.00");
    expect(hodnota(x, "typ:priceHighVAT")).toBe("11.50");
    expect(hodnota(x, "typ:priceNone")).toBe("-20.00");
  });
});

describe("konektor a balík — odpočet z dokladu k platbe, nie z pomeru zálohovej faktúry (V1)", () => {
  /** Falošný klient Supabase: filtre eq/in/is nad riadkami tabuliek. */
  function klient(tabulky: Record<string, any[]>) {
    return {
      from(t: string) {
        let rows = [...(tabulky[t] ?? [])];
        const q: any = {
          select: () => q,
          eq: (k: string, v: unknown) => ((rows = rows.filter((r) => r[k] === v)), q),
          in: (k: string, v: unknown[]) => ((rows = rows.filter((r) => v.includes(r[k]))), q),
          is: (k: string, v: unknown) => ((rows = rows.filter((r) => (r[k] ?? null) === v)), q),
          order: () => q,
          range: () => q,
          then: (ok: any, zle: any) => Promise.resolve({ data: rows, error: null }).then(ok, zle),
        };
        return q;
      },
    };
  }

  it("nacitajVazby: zálohu 23 % + 0 % pošle po sadzbách a faktúre dá `_odpocty`", async () => {
    const { nacitajVazby } = await import("./pohoda-konektor.server");
    const sb = klient({
      invoice_advances: [{ company_id: "c1", invoice_id: "fa-6", advance_invoice_id: "zf-2", amount: 3.23 }],
      invoices: [
        { id: "zf-2", company_id: "c1", type: "proforma", invoice_number: "ZF20260002", subtotal: 3, vat_total: 0.23 },
        {
          id: "ddp-3",
          company_id: "c1",
          type: "advance_payment",
          invoice_number: "260800003",
          advance_invoice_id: "zf-2",
          status: "paid",
          deleted_at: null,
          invoice_items: [
            { vat_rate: 23, subtotal: 1, vat_amount: 0.23 },
            { vat_rate: 0, subtotal: 1, vat_amount: 0 },
            { vat_rate: 0, subtotal: 1, vat_amount: 0 },
          ],
        },
      ],
    });
    const f: any = faktura();
    const { zalohy } = await nacitajVazby(sb, "c1", [f], new Map([["zf-2", "ZFP-2"]]));
    expect(zalohy["fa-6"]).toHaveLength(2);
    expect(zalohy["fa-6"]).toEqual(
      expect.arrayContaining([
        { cislo: "ZFP-2", sadzba: 23, zaklad: 1, dph: 0.23 },
        { cislo: "ZFP-2", sadzba: 0, zaklad: 2, dph: 0 },
      ]),
    );
    expect(f._odpocty).toHaveLength(1);
    expect(pohodaPrekazka(f, firma, { items: polozky as any, nastavenia })).toBeNull();
  });
});

describe("daňový doklad k platbe v cudzej mene (V3)", () => {
  it("ide do súboru s kurzom (interný doklad v cudzej mene), nevypadne potichu", async () => {
    const ddp: any = faktura({
      id: "ddp-cz",
      type: "advance_payment",
      invoice_number: "DDP2026009",
      currency: "CZK",
      exchange_rate: 25.2,
      paid_at: "2026-11-03",
      subtotal: 1000,
      vat_total: 230,
      total: 1230,
    });
    const s = POHODA_XML.build({
      company: firma, // predvolene ide doklad k platbe do Interných dokladov
      nastavenia,
      invoices: [
        { invoice: ddp, items: [{ name: "Záloha", quantity: 1, unit_price: 1000, vat_rate: 23, subtotal: 1000, vat_amount: 230, total: 1230 }] as any },
      ],
    }) as any;
    expect(s.preskocene).toEqual([]);
    expect(s.content).toContain("DDP2026009");
    expect(s.content).toContain("<typ:ids>CZK</typ:ids>");
    expect(s.content).toContain("<typ:rate>25.2</typ:rate>");
    expect(await chybaXsd(s.content)).toBeNull();
  });

  it("bez kurzu ho kontrola zastaví a nahlási (neoznačí sa)", () => {
    const ddp: any = faktura({ id: "d", type: "advance_payment", invoice_number: "DDP2", currency: "CZK", exchange_rate: null });
    const ok: any = faktura({ id: "o", invoice_number: "FA-OK" });
    const s = POHODA_XML.build({
      company: firma,
      nastavenia,
      invoices: [
        { invoice: ddp, items: polozky as any },
        { invoice: ok, items: polozky as any },
      ],
    }) as any;
    expect(s.preskocene.map((d: string) => d.split(" — ")[0])).toEqual(["DDP2"]);
  });
});

describe("prijatá faktúra s odpočtom nezdanenej zálohy (S4)", () => {
  const prijata = (o: any = {}) => ({
    id: "pi-1",
    company_id: "c1",
    type: "regular",
    invoice_number: "202652141",
    supplier_name: "JŠ servis s.r.o.",
    supplier_ico: "34152181",
    supplier_country: "SK",
    issue_date: "2026-11-02",
    delivery_date: "2026-11-02",
    received_date: "2026-11-03",
    due_date: "2026-11-16",
    variable_symbol: "202652141",
    currency: "EUR",
    amount_without_vat: 1026.95,
    vat_amount: 236.2,
    amount_total: 1263.15,
    advance_amount: 900,
    pohoda_predkontacia: "1Fp",
    pohoda_clenenie_dph: "PD",
    zauctovane_at: "2026-11-04T10:00:00Z",
    vat_breakdown: [{ sadzba: 23, zaklad: 1026.95, dph: 236.2 }],
    ...o,
  });

  it("ruční odpočet zálohy bez DPH, k úhrade len rozdiel, DPH celá; platné podľa XSD", async () => {
    const x = buildPohodaExpensesXml({ company: firma, nastavenia, doklady: [prijataAkoDoklad(prijata())] } as any);
    expect(await chybaXsd(x)).toBeNull();
    const o = odpocty(x);
    expect(o).toHaveLength(1);
    expect(o[0]).not.toContain("sourceDocument");
    expect(hodnota(o[0], "inv:rateVAT")).toBe("none");
    expect(hodnota(o[0], "typ:price")).toBe("-900.00");
    // Doklad s položkou odpočtu ide s položkami (súhrn by Pohoda prepočítala z položiek).
    expect(x).toContain("<inv:invoiceItem>");
    const suhrn = /<inv:invoiceSummary>[\s\S]*?<\/inv:invoiceSummary>/.exec(x)![0];
    expect(hodnota(suhrn, "typ:priceHigh")).toBe("1026.95");
    expect(hodnota(suhrn, "typ:priceHighVAT")).toBe("236.20");
    expect(hodnota(suhrn, "typ:priceNone")).toBe("-900.00");
  });

  it("bez odpočtu sa prijatá nemení; prijatá zálohová odpočet nemá", () => {
    const bez = buildPohodaExpensesXml({ company: firma, nastavenia, doklady: [prijataAkoDoklad(prijata({ advance_amount: 0 }))] } as any);
    expect(odpocty(bez)).toHaveLength(0);
    expect(prijataAkoDoklad(prijata({ type: "proforma" }))._odpocetZalohy).toBeNull();
  });
});
