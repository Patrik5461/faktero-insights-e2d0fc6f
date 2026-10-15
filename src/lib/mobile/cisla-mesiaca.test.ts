import { describe, expect, it } from "vitest";
import { hraniceMesiaca, spocitajMesiac, type FakturaMesiaca } from "./cisla-mesiaca";

const fa = (z: Partial<FakturaMesiaca>): FakturaMesiaca => ({
  type: "regular",
  status: "sent",
  currency: "EUR",
  total: 123,
  subtotal: 100,
  vat_total: 23,
  ...z,
});

const prazdne = { prijate: [], blocky: [], domaca: "EUR", platitelDph: true };

describe("čísla za mesiac na Prehľade", () => {
  it("hranice mesiaca prejdú aj cez koniec roka", () => {
    expect(hraniceMesiaca(new Date(2026, 9, 15))).toEqual({ od: "2026-10-01", do: "2026-11-01" });
    expect(hraniceMesiaca(new Date(2026, 11, 31))).toEqual({ od: "2026-12-01", do: "2027-01-01" });
  });

  it("tržby bez DPH: koncept, zrušená a zálohová sa nepočítajú, dobropis odpočíta", () => {
    const c = spocitajMesiac({
      ...prazdne,
      faktury: [
        fa({}),
        fa({ status: "draft" }),
        fa({ status: "cancelled" }),
        fa({ type: "proforma" }),
        fa({ type: "credit_note", total: -12.3, subtotal: -10, vat_total: -2.3 }),
      ],
    });
    expect(c.trzby).toBe(90);
    expect(c.dph).toBe(20.7);
  });

  it("DPH sa neplatiteľovi neukazuje", () => {
    expect(spocitajMesiac({ ...prazdne, platitelDph: false, faktury: [fa({})] }).dph).toBeNull();
  });

  it("cudzia mena ide cez prepočet; bez neho číslo radšej chýba", () => {
    const s = spocitajMesiac({
      ...prazdne,
      faktury: [
        fa({}),
        fa({
          currency: "CZK",
          subtotal: 2500,
          subtotal_eur: 99.5,
          vat_total_eur: 20.9,
          total_eur: 120.4,
        }),
      ],
    });
    expect(s.trzby).toBe(199.5);
    const bez = spocitajMesiac({ ...prazdne, faktury: [fa({}), fa({ currency: "CZK" })] });
    expect(bez.trzby).toBeNull();
  });

  it("neuhradené len z otvorených faktúr mesiaca, s DPH", () => {
    const c = spocitajMesiac({
      ...prazdne,
      faktury: [fa({}), fa({ status: "paid", paid_at: "2026-10-03" }), fa({ type: "credit_note" })],
    });
    expect(c.neuhradene).toBe(123);
  });

  it("náklady: prijaté faktúry bez záloh a bločky bez DPH", () => {
    const c = spocitajMesiac({
      ...prazdne,
      faktury: [],
      prijate: [
        { type: "regular", status: "unpaid", currency: "EUR", amount_without_vat: 50 },
        { type: "proforma", status: "unpaid", currency: "EUR", amount_without_vat: 999 },
        { type: "regular", status: "cancelled", currency: "EUR", amount_without_vat: 999 },
      ],
      blocky: [
        { currency: "EUR", net_amount: 6.2, total_amount: 7.38, vat_amount: 1.18 },
        { currency: "EUR", net_amount: null, total_amount: 12.3, vat_amount: 2.3 },
      ],
    });
    expect(c.naklady).toBe(66.2);
  });

  it("bloček v cudzej mene zhodí náklady na neznáme", () => {
    const c = spocitajMesiac({
      ...prazdne,
      faktury: [],
      blocky: [{ currency: "HUF", net_amount: 1000, total_amount: 1270, vat_amount: 270 }],
    });
    expect(c.naklady).toBeNull();
  });
});
