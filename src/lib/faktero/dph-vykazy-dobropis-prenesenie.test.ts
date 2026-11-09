import { describe, expect, it } from "vitest";
import { nacitajVstup } from "./dph-vykazy.server";
import { kontrolnyVykaz, priznanie } from "./dph-vykazy";

/*
  Audit 8. 11. 2026: prijatý dobropis v prenesení (§ 69) s vyplneným číslom
  pôvodnej faktúry vypadol z priznania aj KV (tuzemské prenesenie) alebo išiel
  len do r. 28 a zvýšil daň na úhradu (služba z EÚ).
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
        neq: () => q,
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
  status: "received",
  odpocet: true,
  items: [],
  ...x,
});

describe("prijatý dobropis v prenesení daňovej povinnosti", () => {
  it("služba z EÚ: dobropis zníži samozdanenie aj odpočet, daň na úhradu sa nezmení", async () => {
    const { vstup } = await nacitajVstup(
      klient({
        companies: [{ country: "SK" }],
        purchase_invoices: [
          prijata({
            invoice_number: "CN-1",
            opravuje_cislo: "INV-1",
            supplier_ic_dph: "DE123456789",
            dph_rezim: "samozdanenie",
            currency: "USD",
            amount_without_vat: -1100,
            amount_without_vat_eur: -1000,
            vat_amount: 0,
            vat_amount_eur: 0,
            amount_total: -1100,
            issue_date: "2026-10-05",
            delivery_date: "2026-10-05",
            received_date: "2026-10-06",
          }),
        ],
      }) as any,
      "f",
      oktober,
    );
    const pr = priznanie(vstup) as any;
    expect(pr.r09b ?? pr.r09).toBe(-1000);
    expect(pr.r10b ?? pr.r10).toBe(-230);
    expect(pr.r19).toBe(-230);
    expect(pr.r28 ?? 0).toBe(0);
    const kv = kontrolnyVykaz(vstup);
    expect(kv.b1.map((r: any) => [r.f, r.z, r.d])).toEqual([["CN-1", -1000, -230]]);
  });

  it("tuzemské prenesenie (stavebné práce): dobropis s číslom pôvodnej faktúry nevypadne", async () => {
    const { vstup } = await nacitajVstup(
      klient({
        companies: [{ country: "SK" }],
        purchase_invoices: [
          prijata({
            invoice_number: "DOB-7",
            opravuje_cislo: "FA-7",
            supplier_ic_dph: "SK2020273893",
            reverse_charge: true,
            amount_without_vat: -500,
            vat_amount: 0,
            amount_total: -500,
            issue_date: "2026-10-10",
            delivery_date: "2026-09-30",
            received_date: "2026-10-12",
            vat_breakdown: [{ rate: 0, base: -500, vat: 0, vat_category: "reverse_charge" }],
          }),
        ],
      }) as any,
      "f",
      oktober,
    );
    expect(vstup.prijate.map((p) => p.cislo)).toEqual(["DOB-7"]);
    const pr = priznanie(vstup) as any;
    expect(pr.r09b ?? pr.r09).toBe(-500);
    expect(pr.r10b ?? pr.r10).toBe(-115);
    expect(pr.r19).toBe(-115);
    expect(pr.r28 ?? 0).toBe(0);
    expect(kontrolnyVykaz(vstup).b1.map((r: any) => r.f)).toEqual(["DOB-7"]);
  });

  it("tuzemský dobropis bez prenesenia ide ako doteraz do r. 28 a C.2", async () => {
    const { vstup } = await nacitajVstup(
      klient({
        companies: [{ country: "SK" }],
        purchase_invoices: [
          prijata({
            invoice_number: "DOB-T",
            opravuje_cislo: "FA-T",
            supplier_ic_dph: "SK2020273893",
            amount_without_vat: -100,
            vat_amount: -23,
            amount_total: -123,
            issue_date: "2026-10-10",
            received_date: "2026-10-12",
          }),
        ],
      }) as any,
      "f",
      oktober,
    );
    expect((priznanie(vstup) as any).r28).toBe(23);
    expect(kontrolnyVykaz(vstup).c2.map((r: any) => r.fo)).toEqual(["DOB-T"]);
  });
});
