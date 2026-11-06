import { describe, expect, it } from "vitest";
import { nacitajVstup } from "./dph-vykazy.server";
import { kontrolnyVykaz, preneseniePrijatej, priznanie, VYTKA_PLATITEL_BEZ_DPH, VYTKA_PRENESENIE_KV_X } from "./dph-vykazy";
import { kvNaXml } from "./dph-vykazy-xml";

/*
  Opravy z auditu 6. 11. 2026 (BÝVAJLEPŠIE, PALIERA, Tobify za 10/2026):
  prenesenie bez príznaku, „Den“ v KV B.1/B.2, sadzba mimo platných, doklad
  na kontrole a registrovaná osoba podľa § 7 / § 7a. Databázu nahrádza klient,
  ktorý vráti riadky podľa tabuľky a filtre ignoruje.
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

const oktober = { rok: 2026, mesiac: 10 };

const prijata = (x: Record<string, unknown>) => ({
  id: String(x.invoice_number),
  currency: "EUR",
  type: "regular",
  odpocet: true,
  items: [],
  ...x,
});

describe("prenesenie na prijatej faktúre bez príznaku", () => {
  it("rozpozná prenesenie z členenia DPH a KV, nie z PD ani PN", () => {
    expect(preneseniePrijatej({ clenenieDph: "PDsluz" }).pdp).toBe(true);
    expect(preneseniePrijatej({ clenenieDph: "DDsluz" }).pdp).toBe(true);
    expect(preneseniePrijatej({ clenenieDph: "PBsluz" })).toEqual({ pdp: true, bezNaroku: true });
    expect(preneseniePrijatej({ kv: "B1" }).pdp).toBe(true);
    expect(preneseniePrijatej({ kv: "B1-0" })).toEqual({ pdp: true, bezNaroku: true });
    expect(preneseniePrijatej({ clenenieDph: "PD" }).pdp).toBe(false);
    expect(preneseniePrijatej({ clenenieDph: "PN" }).pdp).toBe(false);
    expect(preneseniePrijatej({ clenenieDph: "PDnadEU", kv: "B2" }).pdp).toBe(false);
  });

  it("SK dodávateľ bez dane s PDsluz / DDsluz / KV B1 sa samozdaní (r. 09b/10b, odpočet r. 19, KV B.1)", async () => {
    const { vstup, vytky } = await nacitajVstup(
      klient({
        companies: [{ country: "SK" }],
        purchase_invoices: [
          // 2026029 PARE INVEST — PDsluz, bez dátumu dodania (deň vyhotovenia), KV ručne „X“.
          prijata({ invoice_number: "2026029", supplier_ic_dph: "SK2022829633", issue_date: "2026-10-22", received_date: "2026-10-28", amount_without_vat: 9469, vat_amount: 0, amount_total: 9469, pohoda_clenenie_dph: "PDsluz", kv_clenenie: "X" }),
          // F22026073 UNIPROGRES — DDsluz + KV B1.
          prijata({ invoice_number: "F22026073", supplier_ic_dph: "SK2020008331", issue_date: "2026-10-15", received_date: "2026-10-28", amount_without_vat: 76.5, vat_amount: 0, amount_total: 76.5, pohoda_clenenie_dph: "DDsluz", kv_clenenie: "B1" }),
          // Len KV B1, členenie bežné.
          prijata({ invoice_number: "KV-B1", supplier_ic_dph: "SK2020000001", delivery_date: "2026-10-03", received_date: "2026-10-05", amount_without_vat: 1000, vat_amount: 0, amount_total: 1000, kv_clenenie: "B1" }),
        ],
      }) as any,
      "f",
      oktober,
    );
    const dp = priznanie(vstup);
    expect(dp.r09b).toBe(10545.5);
    expect(dp.r10b).toBe(2425.47);
    expect(dp.r19).toBe(dp.r10b);
    expect(dp.r21 ?? 0).toBe(0);
    const kv = kontrolnyVykaz(vstup);
    expect(kv.b1.map((r) => r.f).sort()).toEqual(["F22026073", "KV-B1"]);
    expect(kv.b1.find((r) => r.f === "F22026073")).toMatchObject({ den: "2026-10-15", z: 76.5, d: 17.6, s: 23, o: 17.6 });
    // Ručné „X“ sa rešpektuje, ale nesmie prejsť ticho.
    expect(vytky).toContainEqual({ doklad: "2026029", text: VYTKA_PRENESENIE_KV_X });
  });

  it("samozdanenie prenesenia ide do obdobia dodania, nie prijatia", async () => {
    const { vstup } = await nacitajVstup(
      klient({
        companies: [{ country: "SK" }],
        purchase_invoices: [
          // 26090019 — dodané 24. 9., prijaté 28. 10. → patrí do 09/2026.
          prijata({ invoice_number: "26090019", supplier_ic_dph: "SK2020061065", issue_date: "2026-09-24", delivery_date: "2026-09-24", received_date: "2026-10-28", amount_without_vat: 12658.79, vat_amount: 0, amount_total: 12658.79, pohoda_clenenie_dph: "PDsluz", kv_clenenie: "B1" }),
        ],
      }) as any,
      "f",
      oktober,
    );
    expect(vstup.prijate).toHaveLength(0);
  });

  it("PBsluz / B1-0 — samozdanenie bez odpočtu", async () => {
    const { vstup } = await nacitajVstup(
      klient({
        companies: [{ country: "SK" }],
        purchase_invoices: [
          prijata({ invoice_number: "PB1", supplier_ic_dph: "SK2020000002", delivery_date: "2026-10-10", amount_without_vat: 100, vat_amount: 0, amount_total: 100, pohoda_clenenie_dph: "PBsluz" }),
        ],
      }) as any,
      "f",
      oktober,
    );
    const dp = priznanie(vstup);
    expect(dp.r10b).toBe(23);
    expect(dp.r19 ?? 0).toBe(0);
    expect(kontrolnyVykaz(vstup).b1[0]).toMatchObject({ f: "PB1", d: 23, o: 0 });
  });

  it("SK platiteľ bez dane bez známky prenesenia — výtka; PN, X a PD s daňou nie", async () => {
    const { vytky } = await nacitajVstup(
      klient({
        companies: [{ country: "SK" }],
        purchase_invoices: [
          prijata({ invoice_number: "BEZ", supplier_ic_dph: "SK2020000003", delivery_date: "2026-10-10", amount_without_vat: 500, vat_amount: 0, amount_total: 500, pohoda_clenenie_dph: "PD" }),
          prijata({ invoice_number: "PN1", supplier_ic_dph: "SK2021929558", delivery_date: "2026-10-10", amount_without_vat: 200, vat_amount: 0, amount_total: 200, pohoda_clenenie_dph: "PN", kv_clenenie: "X" }),
          prijata({ invoice_number: "S-DAN", supplier_ic_dph: "SK2020000004", delivery_date: "2026-10-10", amount_without_vat: 100, vat_amount: 23, amount_total: 123, pohoda_clenenie_dph: "PD" }),
        ],
      }) as any,
      "f",
      oktober,
    );
    expect(vytky.filter((v) => v.text === VYTKA_PLATITEL_BEZ_DPH).map((v) => v.doklad)).toEqual(["BEZ"]);
  });
});

describe("KV B.1/B.2 — Den je deň dodania", () => {
  it("B.2 má DUZP, zaradenie do obdobia ostáva podľa prijatia (FV-81967/2026)", async () => {
    const { vstup } = await nacitajVstup(
      klient({
        companies: [{ country: "SK" }],
        purchase_invoices: [
          prijata({ invoice_number: "FV-81967/2026", supplier_ic_dph: "SK2020000005", issue_date: "2026-08-31", delivery_date: "2026-08-31", received_date: "2026-10-06", amount_without_vat: 100, vat_amount: 23, amount_total: 123 }),
          // Bez dátumu dodania — deň vyhotovenia.
          prijata({ invoice_number: "BEZ-DUZP", supplier_ic_dph: "SK2020000006", issue_date: "2026-09-29", received_date: "2026-10-02", amount_without_vat: 10, vat_amount: 2.3, amount_total: 12.3 }),
        ],
      }) as any,
      "f",
      oktober,
    );
    const kv = kontrolnyVykaz(vstup);
    expect(kv.b2.map((r) => [r.f, r.den])).toEqual([
      ["FV-81967/2026", "2026-08-31"],
      ["BEZ-DUZP", "2026-09-29"],
    ]);
    expect(priznanie(vstup).r19).toBe(25.3);
    const xml = kvNaXml(kv, { dic: "2020000000", icDph: "SK2020000000", nazov: "F" } as any, oktober, "R");
    expect(xml).toContain('F="FV-81967/2026" Den="2026-08-31"');
  });
});

describe("rozpis DPH a doklad na kontrole", () => {
  it("priemerná sadzba (16,82 %) a na_kontrolu_at dajú výtku, doklad ostane vo výkaze", async () => {
    const { vstup, vytky } = await nacitajVstup(
      klient({
        companies: [{ country: "SK" }],
        purchase_invoices: [
          prijata({
            invoice_number: "FV2600692",
            supplier_ic_dph: "SK2020133258",
            issue_date: "2026-10-19",
            received_date: "2026-10-28",
            amount_without_vat: 1285.26,
            vat_amount: 216.13,
            amount_total: 1501.39,
            na_kontrolu_at: "2026-11-05T14:49:20Z",
            na_kontrolu_dovod: "Rozpis DPH treba skontrolovať",
          }),
        ],
        expense_documents: [
          { id: "d1", document_number: "B-1", supplier_ic_dph: "SK2020000007", issue_date: "2026-10-04", currency: "EUR", status: "processed", net_amount: 10, vat_amount: 2.3, odpocet: true, na_kontrolu_at: "2026-11-05T10:00:00Z", na_kontrolu_dovod: "rozpis" },
        ],
      }) as any,
      "f",
      oktober,
    );
    expect(vstup.prijate).toHaveLength(1);
    const texty = vytky.filter((v) => v.doklad === "FV2600692").map((v) => v.text);
    expect(texty.some((t) => t.startsWith("Doklad čaká na kontrolu (Rozpis DPH treba skontrolovať)"))).toBe(true);
    expect(texty.some((t) => t.startsWith("Rozpis DPH nesedí — sadzba 16,82 %"))).toBe(true);
    expect(vytky.some((v) => v.doklad === "B-1" && v.text.startsWith("Doklad čaká na kontrolu"))).toBe(true);
  });

  it("platná sadzba bez kontroly výtku nedá", async () => {
    const { vytky } = await nacitajVstup(
      klient({
        companies: [{ country: "SK" }],
        purchase_invoices: [
          prijata({ invoice_number: "OK", supplier_ic_dph: "SK2020000008", delivery_date: "2026-10-10", amount_without_vat: 100, vat_amount: 23, amount_total: 123 }),
        ],
      }) as any,
      "f",
      oktober,
    );
    expect(vytky).toEqual([]);
  });
});

describe("registrovaná osoba podľa § 7 / § 7a", () => {
  const tabulky = (schema: string) => ({
    companies: [{ country: schema.startsWith("cz") ? "CZ" : "SK", vat_scheme: schema }],
    purchase_invoices: [
      // Služba z EÚ — samozdaní sa.
      prijata({ invoice_number: "IE-1", supplier_ic_dph: "IE6388047V", delivery_date: "2026-10-10", amount_without_vat: 100, vat_amount: 0, amount_total: 100 }),
      // Tuzemská faktúra s DPH — odpočet nie je.
      prijata({ invoice_number: "SK-1", supplier_ic_dph: "SK2020000009", delivery_date: "2026-10-10", amount_without_vat: 50, vat_amount: 11.5, amount_total: 61.5 }),
    ],
    expense_documents: [
      { id: "d1", document_number: "B-1", supplier_ic_dph: "SK2020000010", issue_date: "2026-10-04", currency: "EUR", status: "processed", net_amount: 16.26, vat_amount: 3.74, odpocet: true },
    ],
  });

  it("sk_7: len samozdanenie, bez odpočtu r. 18–23 a bez KV", async () => {
    const { vstup } = await nacitajVstup(klient(tabulky("sk_7")) as any, "f", oktober);
    expect(vstup.registrovanaOsoba).toBe(true);
    const dp = priznanie(vstup);
    expect(dp.r09b).toBe(100);
    expect(dp.r10b).toBe(23);
    expect(dp.r17).toBe(23);
    for (const k of ["r18", "r18a", "r19", "r20", "r20a", "r21", "r22", "r23"]) expect(dp[k] ?? 0).toBe(0);
    expect(dp.r32).toBe(23);
    const kv = kontrolnyVykaz(vstup);
    expect([kv.a1, kv.a2, kv.b1, kv.b2, kv.b32, kv.c1, kv.c2].every((x) => x.length === 0)).toBe(true);
    expect(kv.b31).toBeNull();
  });

  it("sk_7a rovnako; platiteľ sk_4 odpočet má", async () => {
    const { vstup: v7a } = await nacitajVstup(klient(tabulky("sk_7a")) as any, "f", oktober);
    expect(priznanie(v7a).r19 ?? 0).toBe(0);
    const { vstup: v4 } = await nacitajVstup(klient(tabulky("sk_4")) as any, "f", oktober);
    expect(v4.registrovanaOsoba).toBeUndefined();
    expect(priznanie(v4).r19).toBe(centy(23 + 11.5 + 3.74));
    expect(kontrolnyVykaz(v4).b2).toHaveLength(1);
  });

  it("cz_identifikovana: prijaté bez nároku na odpočet", async () => {
    const { vstup } = await nacitajVstup(klient(tabulky("cz_identifikovana")) as any, "f", oktober);
    expect(vstup.registrovanaOsoba).toBe(true);
    expect([...vstup.prijate, ...vstup.doklady].every((p) => p.odpocet === false)).toBe(true);
  });
});

function centy(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
