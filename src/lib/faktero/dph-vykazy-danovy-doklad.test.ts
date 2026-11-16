import { describe, expect, it } from "vitest";
import { nacitajVstup } from "./dph-vykazy.server";
import { kontrolnyVykaz, priznanie } from "./dph-vykazy";
import { VYTKA_DVOJITA_DPH_ZALOHY } from "./prijaty-danovy-doklad";

/*
  Prijatý daňový doklad k prijatej platbe (`purchase_invoices.type =
  advance_payment`): DPH zo zaplatenej zálohy sa odpočíta v období dňa
  platby (DUZP), najskôr dňom prijatia dokladu; KV B.2. Vyúčtovacia faktúra
  potom zdanenú zálohu odpočíta záporným riadkom rozpisu DPH — DPH zálohy
  sa tak neráta dvakrát.
*/

/** Klient, ktorý vráti riadky tabuľky; filter `type` spracuje ako databáza. */
function klient(tabulky: Record<string, any[]>) {
  return {
    from(t: string) {
      let riadky = tabulky[t] ?? [];
      const q: any = {
        select: () => q,
        eq: (stlpec: string, v: unknown) => {
          if (stlpec === "type") riadky = riadky.filter((r) => (r.type ?? "regular") === v);
          return q;
        },
        is: () => q,
        in: (stlpec: string, v: unknown[]) => {
          if (stlpec === "type") riadky = riadky.filter((r) => v.includes(r.type ?? "regular"));
          return q;
        },
        not: () => q,
        neq: () => q,
        gte: () => q,
        lte: () => q,
        or: () => q,
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

const dodavatel = {
  supplier_name: "Stavebniny s.r.o.",
  supplier_ico: "36111222",
  supplier_dic: "2022111222",
  supplier_ic_dph: "SK2022111222",
  currency: "EUR",
  odpocet: true,
  items: [],
};

const zalohova = {
  ...dodavatel,
  id: "zf",
  type: "proforma",
  status: "paid",
  invoice_number: "ZF2026010",
  amount_without_vat: 123,
  vat_amount: 0,
  amount_total: 123,
  issue_date: "2026-10-01",
  delivery_date: "2026-10-01",
  payment_date: "2026-10-08",
};

const danovy = {
  ...dodavatel,
  id: "ddp",
  type: "advance_payment",
  status: "paid",
  invoice_number: "DD2026010",
  advance_invoice_id: "zf",
  amount_without_vat: 100,
  vat_amount: 23,
  amount_total: 123,
  vat_breakdown: [{ sadzba: 23, zaklad: 100, dph: 23 }],
  issue_date: "2026-10-09",
  // DUZP = deň prijatia platby (§ 19 ods. 4).
  delivery_date: "2026-10-08",
  payment_date: "2026-10-08",
  received_date: "2026-10-12",
};

/** Vyúčtovacia faktúra: celé plnenie 300 + 69, odpočet zdanenej zálohy −100 / −23. */
const vyuctovacia = {
  ...dodavatel,
  id: "fa",
  type: "regular",
  status: "received",
  invoice_number: "FA2026077",
  advance_invoice_id: "zf",
  amount_without_vat: 200,
  vat_amount: 46,
  amount_total: 246,
  vat_breakdown: [
    { sadzba: 23, zaklad: 300, dph: 69 },
    { sadzba: 23, zaklad: -100, dph: -23 },
  ],
  issue_date: "2026-11-05",
  delivery_date: "2026-11-05",
  received_date: "2026-11-06",
};

const tabulky = (prijate: any[]) => ({ companies: [{ country: "SK" }], purchase_invoices: prijate });

describe("prijatý daňový doklad k prijatej platbe vo výkazoch k DPH", () => {
  it("október: odpočet DPH zo zálohy (r. 19/21) a KV B.2 dňom prijatia platby, zálohová faktúra nie", async () => {
    const { vstup, vytky } = await nacitajVstup(
      klient(tabulky([zalohova, danovy, vyuctovacia])) as any,
      "f",
      { rok: 2026, mesiac: 10 },
    );
    expect(vstup.prijate.map((p) => p.cislo)).toEqual(["DD2026010"]);
    const pr = priznanie(vstup) as any;
    expect(pr.r21).toBe(23);
    expect(pr.r19).toBe(23);
    const kv = kontrolnyVykaz(vstup);
    expect(kv.b2.map((r: any) => [r.f, r.z, r.d, r.o])).toEqual([["DD2026010", 100, 23, 23]]);
    // DUZP v KV = deň platby, nie vystavenia.
    expect(kv.b2[0]).toMatchObject({ f: "DD2026010" });
    expect(vytky).toEqual([]);
  });

  it("november: vyúčtovacia faktúra so záporným riadkom zálohy odpočíta len rozdiel (46, nie 69)", async () => {
    const { vstup, vytky } = await nacitajVstup(
      klient(tabulky([zalohova, danovy, vyuctovacia])) as any,
      "f",
      { rok: 2026, mesiac: 11 },
    );
    expect(vstup.prijate.map((p) => p.cislo)).toEqual(["FA2026077"]);
    const pr = priznanie(vstup) as any;
    expect(pr.r21).toBe(46);
    const kv = kontrolnyVykaz(vstup);
    expect(kv.b2.map((r: any) => [r.f, r.z, r.d])).toEqual([["FA2026077", 200, 46]]);
    // Spolu za oba mesiace 23 + 46 = 69 = DPH celého plnenia — nič dvakrát.
    expect(vytky).toEqual([]);
  });

  it("daňový doklad prijatý v ďalšom mesiaci: odpočet až v mesiaci prijatia (§ 51 ods. 1)", async () => {
    const neskoro = { ...danovy, received_date: "2026-11-03" };
    const okt = await nacitajVstup(klient(tabulky([neskoro])) as any, "f", { rok: 2026, mesiac: 10 });
    expect(okt.vstup.prijate).toEqual([]);
    const nov = await nacitajVstup(klient(tabulky([neskoro])) as any, "f", { rok: 2026, mesiac: 11 });
    expect(nov.vstup.prijate.map((p) => p.cislo)).toEqual(["DD2026010"]);
    expect((priznanie(nov.vstup) as any).r21).toBe(23);
  });

  it("vyúčtovacia faktúra, ktorá zdanenú zálohu odpočítala len zo sumy na úhradu, dostane výtku", async () => {
    const zlaFaktura = {
      ...vyuctovacia,
      amount_without_vat: 300,
      vat_amount: 69,
      amount_total: 369,
      advance_amount: 123,
      vat_breakdown: [{ sadzba: 23, zaklad: 300, dph: 69 }],
    };
    const { vytky } = await nacitajVstup(klient(tabulky([zalohova, danovy, zlaFaktura])) as any, "f", {
      rok: 2026,
      mesiac: 11,
    });
    expect(vytky).toContainEqual({ doklad: "FA2026077", text: VYTKA_DVOJITA_DPH_ZALOHY });
  });
});
