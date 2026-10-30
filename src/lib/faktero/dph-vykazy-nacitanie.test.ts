import { describe, expect, it } from "vitest";
import { nacitajVstup } from "./dph-vykazy.server";
import { kontrolnyVykaz, odvodRezimPrijatej, priznanie } from "./dph-vykazy";

/*
  Načítanie dokladov do výkazov k DPH — chyby z prechodu proti skutočným
  dokladom (október 2026). Databázu nahrádza klient, ktorý vráti riadky podľa
  tabuľky a filtre ignoruje (každý test si dá len svoje doklady).
*/

function klient(tabulky: Record<string, any[]>) {
  return {
    from(t: string) {
      const riadky = tabulky[t] ?? [];
      const q: any = {
        select: () => q,
        eq: () => q,
        is: () => q,
        in: () => q,
        not: () => q,
        gte: () => q,
        lte: () => q,
        order: () => q,
        limit: () => q,
        range: () => q,
        maybeSingle: () => Promise.resolve({ data: riadky[0] ?? null, error: null }),
        single: () => Promise.resolve({ data: riadky[0] ?? null, error: null }),
        then: (ok: any, zle: any) => Promise.resolve({ data: riadky, error: null }).then(ok, zle),
      };
      return q;
    },
  };
}

const obdobie = { rok: 2026, mesiac: 9 };

describe("prijaté faktúry vo výkazoch", () => {
  it("viac sadzieb sa rozpíše podľa položiek, nie odhadne z podielu dane", async () => {
    const { vstup } = await nacitajVstup(
      klient({
        purchase_invoices: [
          {
            id: "p1",
            invoice_number: "DF-778",
            supplier_ic_dph: "SK2021987654",
            delivery_date: "2026-09-11",
            currency: "EUR",
            amount_without_vat: 230,
            vat_amount: 47.5,
            amount_total: 277.5,
            type: "regular",
            items: [
              { name: "Materiál", quantity: 10, unit_price: 20, vat_rate: 23, subtotal: 200, vat_amount: 46, total: 246 },
              { name: "Kniha", quantity: 1, unit_price: 30, vat_rate: 5, subtotal: 30, vat_amount: 1.5, total: 31.5 },
            ],
          },
        ],
      }) as any,
      "f",
      obdobie,
    );
    const dp = priznanie(vstup);
    expect(dp.r19).toBe(46);
    expect(dp.r18a).toBe(1.5);
    expect(kontrolnyVykaz(vstup).b2.map((r) => r.s)).toEqual([23, 5]);
  });

  it("faktúra iného odberateľa (nepotvrdená) do odpočtu nejde, ozve sa výtkou", async () => {
    const riadok = {
      id: "p9",
      invoice_number: "TZ2026106",
      supplier_ic_dph: "SK2120123456",
      delivery_date: "2026-09-20",
      currency: "EUR",
      amount_without_vat: 100,
      vat_amount: 23,
      amount_total: 123,
      type: "regular",
      items: [],
    };
    const cudzia = await nacitajVstup(
      klient({
        purchase_invoices: [
          { ...riadok, odberatel_nesedi: { dovod: "ico", odberatel: { ico: "86179504" }, firma: {} } },
        ],
      }) as any,
      "f",
      obdobie,
    );
    expect(priznanie(cudzia.vstup).r19 ?? 0).toBe(0);
    expect(kontrolnyVykaz(cudzia.vstup).b2).toEqual([]);
    expect(cudzia.vytky.map((v) => v.doklad)).toContain("TZ2026106");
    // Po potvrdení „Faktúra patrí tejto firme“ (príznak null) ide normálne do odpočtu.
    const potvrdena = await nacitajVstup(
      klient({ purchase_invoices: [{ ...riadok, odberatel_nesedi: null }] }) as any,
      "f",
      obdobie,
    );
    expect(priznanie(potvrdena.vstup).r19).toBe(23);
  });

  it("prijatý dobropis opraví odpočet (r. 28, C.2)", async () => {
    expect(odvodRezimPrijatej("SK2021987654", -11.5)).toBe("tuzemsko");
    const { vstup } = await nacitajVstup(
      klient({
        purchase_invoices: [
          {
            id: "p2",
            invoice_number: "DOB-12",
            supplier_ic_dph: "SK2021987654",
            delivery_date: "2026-09-22",
            currency: "EUR",
            amount_without_vat: -50,
            vat_amount: -11.5,
            amount_total: -61.5,
            opravuje_cislo: "DF-778",
            type: "regular",
          },
        ],
      }) as any,
      "f",
      obdobie,
    );
    expect(priznanie(vstup).r28).toBe(11.5);
    expect(kontrolnyVykaz(vstup).c2).toHaveLength(1);
  });
});

describe("bločky vo výkazoch", () => {
  const blocek = {
    id: "b1",
    document_number: "B-1",
    issue_date: "2026-09-13",
    currency: "EUR",
    status: "processed",
    net_amount: 100,
    vat_amount: 23,
    vat_breakdown: [{ sadzba: 23, zaklad: 100, dph: 23 }],
  };

  it("nespracovaný bloček do odpočtu nejde, ozve sa výtkou", async () => {
    const { vstup, vytky } = await nacitajVstup(
      klient({ expense_documents: [blocek, { ...blocek, id: "b2", status: "new" }] }) as any,
      "f",
      obdobie,
    );
    expect(vstup.doklady).toHaveLength(1);
    expect(vytky.some((v) => /nie je skontrolovaný/.test(v.text))).toBe(true);
  });

  it("bloček v cudzej mene nejde do výkazu ako eurá", async () => {
    const { vstup, vytky } = await nacitajVstup(
      klient({ expense_documents: [{ ...blocek, currency: "CZK" }] }) as any,
      "f",
      obdobie,
    );
    expect(vstup.doklady).toHaveLength(0);
    expect(vytky[0].text).toMatch(/CZK/);
  });
});

describe("opravné doklady a obdobie", () => {
  it("vystavený dobropis patrí do obdobia vyhotovenia, nie dodania pôvodného plnenia", async () => {
    const dobropis = {
      id: "d1",
      invoice_number: "D-1",
      type: "credit_note",
      status: "sent",
      issue_date: "2026-10-05",
      delivery_date: "2026-08-20",
      currency: "EUR",
      customer_ic_dph: "SK2020123456",
      invoice_items: [{ vat_rate: 23, subtotal: -100, quantity: -1, unit_price: 100 }],
    };
    const v = await nacitajVstup(klient({ invoices: [dobropis] }) as any, "f", { rok: 2026, mesiac: 10 });
    expect(v.vstup.vystavene).toHaveLength(1);
    const aug = await nacitajVstup(klient({ invoices: [dobropis] }) as any, "f", { rok: 2026, mesiac: 8 });
    expect(aug.vstup.vystavene).toHaveLength(0);
  });

  it("prijatý dobropis patrí do obdobia, v ktorom prišiel", async () => {
    const dobropis = {
      id: "p3",
      invoice_number: "DOB-1",
      supplier_ic_dph: "SK2021987654",
      issue_date: "2026-09-29",
      delivery_date: "2026-08-10",
      received_date: "2026-10-02",
      currency: "EUR",
      amount_without_vat: -50,
      vat_amount: -11.5,
      amount_total: -61.5,
      opravuje_cislo: "DF-1",
      type: "regular",
    };
    const okt = await nacitajVstup(klient({ purchase_invoices: [dobropis] }) as any, "f", { rok: 2026, mesiac: 10 });
    expect(priznanie(okt.vstup).r28).toBe(11.5);
    const sep = await nacitajVstup(klient({ purchase_invoices: [dobropis] }) as any, "f", { rok: 2026, mesiac: 9 });
    expect(sep.vstup.prijate).toHaveLength(0);
  });
});

describe("odvodRezimPrijatej podľa krajiny firmy", () => {
  it("česká firma: český dodávateľ s DPH je tuzemský odpočet, nie prenesenie § 92a", () => {
    expect(odvodRezimPrijatej("CZ25097563", 210, "CZ")).toBe("tuzemsko");
    expect(odvodRezimPrijatej("CZ25097563", 0, "CZ")).toBe("bez_dane");
  });
  it("slovenská firma: domáci dodávateľ s DPH tuzemsko, bez dane mimo výkazu", () => {
    expect(odvodRezimPrijatej("SK2021987654", 23)).toBe("tuzemsko");
    expect(odvodRezimPrijatej("SK2021987654", 0)).toBe("bez_dane");
  });
  it("cudzia DPH z EÚ (rakúsky hotel) do priznania nepatrí", async () => {
    const { jeCudziaDph } = await import("./dph-vykazy");
    expect(odvodRezimPrijatej("ATU12345678", 20, "SK")).toBe("bez_dane");
    expect(odvodRezimPrijatej("SK2021987654", 23, "CZ")).toBe("bez_dane");
    expect(jeCudziaDph("ATU12345678", 20, "SK")).toBe(true);
    expect(jeCudziaDph("SK2021987654", 23, "SK")).toBe(false);
    expect(jeCudziaDph("IE6388047V", 0, "SK")).toBe(false);
  });
  it("služba z EÚ bez dane sa samozdaní", () => {
    expect(odvodRezimPrijatej("IE6388047V", 0, "SK")).toBe("samozdanenie");
    expect(odvodRezimPrijatej("DE123456789", 0, "CZ")).toBe("samozdanenie");
  });
  it("nemecká firma: nemecký dodávateľ s daňou je tuzemsko", () => {
    expect(odvodRezimPrijatej("DE123456789", 19, "DE")).toBe("tuzemsko");
  });
});

describe("česká firma — prijatá faktúra od českého dodávateľa", () => {
  it("ide do KH ako B.2 (tuzemský odpočet), nie ako B.1 prenesenie § 92a", async () => {
    const { kontrolniHlaseni } = await import("./cz-dph");
    const { vstup } = await nacitajVstup(
      klient({
        companies: [{ country: "CZ" }],
        purchase_invoices: [
          {
            id: "pcz",
            invoice_number: "FV-2026-114",
            supplier_ic_dph: "CZ25097563",
            delivery_date: "2026-09-11",
            currency: "CZK",
            amount_without_vat: 20000,
            vat_amount: 4200,
            amount_total: 24200,
            type: "regular",
          },
        ],
      }) as any,
      "f-cz",
      obdobie,
    );
    expect(vstup.prijate.map((p) => p.rezim)).toEqual(["tuzemsko"]);
    const kh = kontrolniHlaseni(vstup, { vlastneDic: "CZ12345678" });
    expect(kh.b1).toHaveLength(0);
    expect(kh.b2).toHaveLength(1);
  });
});
