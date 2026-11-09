import { describe, expect, it } from "vitest";
import {
  nacitajPodkladyOstrej,
  nacitajStavOstrej,
  predvyplnenieOstrejZoZalohy,
  type PodkladyOstrej,
} from "./ostra-zo-zalohy";
import { nacitajOdpocty } from "./zalohy-odpocty.server";

/* Jednoduchý falošný klient Supabase nad poľami riadkov (len to, čo kód volá). */
function falosnyKlient(tabulky: Record<string, any[]>) {
  return {
    from(tabulka: string) {
      let riadky = [...(tabulky[tabulka] ?? [])];
      let jeden = false;
      const b: any = {
        select: () => b,
        eq: (k: string, v: unknown) => ((riadky = riadky.filter((r) => r[k] === v)), b),
        in: (k: string, v: unknown[]) => ((riadky = riadky.filter((r) => v.includes(r[k]))), b),
        is: (k: string, v: unknown) => ((riadky = riadky.filter((r) => (r[k] ?? null) === v)), b),
        order: (k: string, o?: { ascending?: boolean }) => {
          riadky.sort((a, c) => String(a[k] ?? "").localeCompare(String(c[k] ?? "")) * (o?.ascending === false ? -1 : 1));
          return b;
        },
        limit: () => b,
        maybeSingle: () => ((jeden = true), b),
        then: (ok: (x: any) => unknown, chyba?: (e: unknown) => unknown) =>
          Promise.resolve({ data: jeden ? (riadky[0] ?? null) : riadky, error: null }).then(ok, chyba),
      };
      return b;
    },
  };
}

const FIRMA = "c0000000-0000-0000-0000-000000000001";
const ZALOHA = "a0000000-0000-0000-0000-000000000001";
const DOKLAD = "d0000000-0000-0000-0000-000000000001";

const zaloha = (x: Partial<any> = {}) => ({
  id: ZALOHA,
  company_id: FIRMA,
  type: "proforma",
  status: "paid",
  invoice_number: "ZF2026001",
  variable_symbol: "2026001",
  customer_id: "o0000000-0000-0000-0000-000000000001",
  currency: "EUR",
  language: "sk",
  payment_method: "bank_transfer",
  payment_account_id: "u0000000-0000-0000-0000-000000000001",
  intro_note: "Fakturujeme Vám dodávku podľa objednávky:",
  total: 1230,
  pohoda_clenenie_dph: "UD",
  kv_clenenie: "A.1",
  deleted_at: null,
  ...x,
});

const polozkyZalohy = [
  {
    invoice_id: ZALOHA,
    position: 0,
    name: "Oceľový nosník",
    description: "",
    quantity: 2,
    unit: "ks",
    unit_price: 400,
    vat_rate: 23,
    discount_percent: 0,
    product_id: "p1",
    stock_item_id: "s1",
    colny_kod: "7216 33 10",
    krajina_povodu: "SK",
    hmotnost_kg: "120.5",
    prenesenie: false,
  },
  {
    invoice_id: ZALOHA,
    position: 1,
    name: "Montáž",
    quantity: 1,
    unit: "hod",
    unit_price: 200,
    vat_rate: 23,
    prenesenie: true,
    colny_kod: "",
  },
];

const doklad = (x: Partial<any> = {}) => ({
  id: DOKLAD,
  company_id: FIRMA,
  type: "advance_payment",
  status: "paid",
  invoice_number: "DP2026001",
  advance_invoice_id: ZALOHA,
  total: 1230,
  discount_total: 0,
  deleted_at: null,
  created_at: "2026-11-01",
  invoice_items: [{ vat_rate: 23, subtotal: 1000, vat_amount: 230, total: 1230, unit_price: 1000 }],
  ...x,
});

describe("predvyplnenie ostrej faktúry zo zálohy", () => {
  it("prevezme hlavičku a položky zálohovej faktúry aj s colnými údajmi a prenesením", async () => {
    const klient = falosnyKlient({
      invoices: [zaloha(), doklad()],
      invoice_items: polozkyZalohy,
      invoice_advances: [],
    });
    // Z daňového dokladu k platbe aj zo zálohy — oba vedú na tú istú zálohu.
    for (const id of [DOKLAD, ZALOHA]) {
      const podklady = await nacitajPodkladyOstrej(klient, FIRMA, id);
      expect(podklady?.zaloha.id).toBe(ZALOHA);
      expect(podklady?.doklad?.id).toBe(DOKLAD);
      const p = predvyplnenieOstrejZoZalohy(podklady!);
      expect(p.hlavicka).toMatchObject({
        customer_id: "o0000000-0000-0000-0000-000000000001",
        currency: "EUR",
        language: "sk",
        payment_method: "bank_transfer",
        payment_account_id: "u0000000-0000-0000-0000-000000000001",
        intro_note: "Fakturujeme Vám dodávku podľa objednávky:",
        clenenie: "UD",
        kv: "A.1",
      });
      expect(p.polozky).toHaveLength(2);
      expect(p.polozky[0]).toMatchObject({
        name: "Oceľový nosník",
        quantity: 2,
        unit_price: 400,
        vat_rate: 23,
        product_id: "p1",
        stock_item_id: "s1",
        colny_kod: "7216 33 10",
        krajina_povodu: "SK",
        hmotnost_kg: 120.5,
        prenesenie: false,
      });
      expect(p.polozky[1]).toMatchObject({ name: "Montáž", unit: "hod", prenesenie: true, colny_kod: null });
      expect(p.odpocet).toEqual({ id: ZALOHA, cislo: "ZF2026001", suma: 1230, mena: "EUR" });
      expect(p.upozornenie).toBeNull();
    }
  });

  it("zdanená záloha (s dokladom k platbe) sa odpočíta so základom a DPH", async () => {
    const klient = falosnyKlient({
      invoices: [zaloha(), doklad(), { id: "f1", company_id: FIRMA, type: "regular", status: "issued" }],
      invoice_items: polozkyZalohy,
      invoice_advances: [],
    });
    const p = predvyplnenieOstrejZoZalohy((await nacitajPodkladyOstrej(klient, FIRMA, DOKLAD))!);
    // Tak, ako ho zapíše formulár do `invoice_advances` — a ako ho prečítajú PDF a exporty.
    const poZapise = falosnyKlient({
      invoices: [zaloha(), doklad()],
      invoice_advances: [{ company_id: FIRMA, invoice_id: "f1", advance_invoice_id: p.odpocet!.id, amount: p.odpocet!.suma }],
    });
    const odpocty = await nacitajOdpocty(poZapise, FIRMA, ["f1"]);
    expect(odpocty.f1).toHaveLength(1);
    expect(odpocty.f1[0]).toMatchObject({ zaloha: "ZF2026001", doklad: "DP2026001", suma: 1230 });
    expect(odpocty.f1[0].riadky).toEqual([{ sadzba: 23, zaklad: 1000, dph: 230 }]);
  });

  it("nezdanená záloha (bez dokladu k platbe) sa odpočíta len sumou", async () => {
    const klient = falosnyKlient({
      invoices: [zaloha()],
      invoice_items: polozkyZalohy,
      invoice_advances: [],
    });
    const podklady = (await nacitajPodkladyOstrej(klient, FIRMA, ZALOHA))!;
    expect(podklady.doklad).toBeNull();
    const p = predvyplnenieOstrejZoZalohy(podklady);
    expect(p.odpocet?.suma).toBe(1230);
    const poZapise = falosnyKlient({
      invoices: [zaloha()],
      invoice_advances: [{ company_id: FIRMA, invoice_id: "f1", advance_invoice_id: ZALOHA, amount: p.odpocet!.suma }],
    });
    const odpocty = await nacitajOdpocty(poZapise, FIRMA, ["f1"]);
    expect(odpocty.f1[0]).toMatchObject({ doklad: null, suma: 1230, riadky: [] });
  });

  it("už vyúčtovanú zálohu neodpočíta druhýkrát a povie, ktorou faktúrou", async () => {
    const klient = falosnyKlient({
      invoices: [
        zaloha(),
        doklad(),
        { id: "f1", company_id: FIRMA, type: "regular", status: "issued", invoice_number: "FA2026010", issue_date: "2026-11-05", deleted_at: null },
      ],
      invoice_items: polozkyZalohy,
      invoice_advances: [{ company_id: FIRMA, invoice_id: "f1", advance_invoice_id: ZALOHA, amount: 1230 }],
    });
    const p = predvyplnenieOstrejZoZalohy((await nacitajPodkladyOstrej(klient, FIRMA, DOKLAD))!);
    expect(p.odpocet).toBeNull();
    expect(p.upozornenie).toMatchObject({ druh: "vyuctovana", zaloha: "ZF2026001" });
    expect((p.upozornenie as any).faktury.map((f: any) => f.invoice_number)).toEqual(["FA2026010"]);
    // Položky sa aj tak predvyplnia — odpočet nie.
    expect(p.polozky).toHaveLength(2);

    const stav = await nacitajStavOstrej(klient, FIRMA, { id: DOKLAD, type: "advance_payment", advance_invoice_id: ZALOHA });
    expect(stav).toMatchObject({ vyuctovana: true, mozeOstru: false, zalohaCislo: "ZF2026001" });
  });

  it("stará faktúra s odpočtom len v advance_amount sa tiež ráta", async () => {
    const klient = falosnyKlient({
      invoices: [
        zaloha(),
        { id: "f0", company_id: FIRMA, type: "regular", status: "paid", invoice_number: "FA2025099", advance_invoice_id: ZALOHA, advance_amount: 1230, deleted_at: null },
      ],
      invoice_items: polozkyZalohy,
      invoice_advances: [],
    });
    const p = predvyplnenieOstrejZoZalohy((await nacitajPodkladyOstrej(klient, FIRMA, ZALOHA))!);
    expect(p.odpocet).toBeNull();
    expect(p.upozornenie?.druh).toBe("vyuctovana");
  });

  it("odpočet zo stornovanej či vymazanej faktúry neplatí — záloha sa odpočíta znova", async () => {
    const klient = falosnyKlient({
      invoices: [
        zaloha(),
        { id: "f1", company_id: FIRMA, type: "regular", status: "cancelled", invoice_number: "FA1", deleted_at: null },
        { id: "f2", company_id: FIRMA, type: "regular", status: "issued", invoice_number: "FA2", deleted_at: "2026-11-02" },
      ],
      invoice_items: polozkyZalohy,
      invoice_advances: [
        { company_id: FIRMA, invoice_id: "f1", advance_invoice_id: ZALOHA, amount: 1230 },
        { company_id: FIRMA, invoice_id: "f2", advance_invoice_id: ZALOHA, amount: 1230 },
      ],
    });
    const p = predvyplnenieOstrejZoZalohy((await nacitajPodkladyOstrej(klient, FIRMA, ZALOHA))!);
    expect(p.odpocet?.suma).toBe(1230);
    expect(p.upozornenie).toBeNull();
  });

  it("čiastočne odpočítaná záloha ponúkne len zvyšok", () => {
    const podklady: PodkladyOstrej = {
      zaloha: zaloha(),
      polozky: polozkyZalohy,
      doklad: doklad(),
      vyuctovane: [{ id: "f1", invoice_number: "FA1", status: "issued", issue_date: "2026-11-05", suma: 1000 }],
    };
    const p = predvyplnenieOstrejZoZalohy(podklady);
    expect(p.odpocet?.suma).toBe(230);
    expect(p.upozornenie).toMatchObject({ druh: "ciastocne", zvysok: 230 });
  });

  it("neuhradená záloha bez dokladu k platbe — položky áno, odpočet nie", () => {
    const p = predvyplnenieOstrejZoZalohy({
      zaloha: zaloha({ status: "issued" }),
      polozky: polozkyZalohy,
      doklad: null,
      vyuctovane: [],
    });
    expect(p.odpocet).toBeNull();
    expect(p.upozornenie?.druh).toBe("neuhradena");
    expect(p.polozky).toHaveLength(2);
  });

  it("čiastočne uhradená záloha s dokladom k platbe odpočíta prijatú sumu", () => {
    const p = predvyplnenieOstrejZoZalohy({
      zaloha: zaloha({ status: "issued" }),
      polozky: polozkyZalohy,
      doklad: doklad({ total: 500 }),
      vyuctovane: [],
    });
    expect(p.odpocet?.suma).toBe(500);
    expect(p.upozornenie).toMatchObject({ druh: "ciastocne_uhradena", prijate: 500 });
  });

  it("iný doklad než záloha či doklad k platbe nevráti nič", async () => {
    const klient = falosnyKlient({
      invoices: [{ id: "f9", company_id: FIRMA, type: "regular", status: "issued", deleted_at: null }],
    });
    expect(await nacitajPodkladyOstrej(klient, FIRMA, "f9")).toBeNull();
  });
});
