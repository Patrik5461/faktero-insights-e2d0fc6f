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
