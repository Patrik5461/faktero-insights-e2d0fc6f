import { describe, expect, it } from "vitest";
import {
  jeOtvorena,
  jePoSplatnosti,
  jeZapocitatelny,
  sucetDokladov,
  znamienkoDokladu,
} from "./faktury-sumy";

const f = (o: Record<string, unknown> = {}) => ({
  status: "issued",
  type: "regular",
  total: 100,
  ...o,
});

describe("jeZapocitatelny", () => {
  it("koncept, storno, zmazaný a zálohová faktúra sa nepočítajú", () => {
    expect(jeZapocitatelny(f({ status: "draft" }))).toBe(false);
    expect(jeZapocitatelny(f({ status: "cancelled" }))).toBe(false);
    expect(jeZapocitatelny(f({ deleted_at: "2026-08-01" }))).toBe(false);
    expect(jeZapocitatelny(f({ type: "proforma" }))).toBe(false);
  });

  it("bežná faktúra aj dobropis áno", () => {
    expect(jeZapocitatelny(f())).toBe(true);
    expect(jeZapocitatelny(f({ type: "credit_note" }))).toBe(true);
  });
});

describe("sucetDokladov", () => {
  it("dobropis odpočíta a zálohovú faktúru vynechá", () => {
    const doklady = [
      f({ total: 500 }),
      f({ total: 123, type: "proforma" }),
      f({ total: 30, type: "credit_note" }),
      f({ total: 999, status: "draft" }),
    ];
    expect(sucetDokladov(doklady, "total")).toBe(470);
  });

  it("prázdny zoznam dá nulu", () => {
    expect(sucetDokladov([], "total")).toBe(0);
  });
});

describe("po splatnosti", () => {
  const dnes = "2026-08-11";

  it("počíta sa z dátumu, nie zo stavu", () => {
    expect(jePoSplatnosti(f({ due_date: "2026-08-01" }), dnes)).toBe(true);
    expect(jePoSplatnosti(f({ due_date: "2026-08-20" }), dnes)).toBe(false);
  });

  it("uhradená faktúra po splatnosti nie je", () => {
    expect(jePoSplatnosti(f({ due_date: "2026-08-01", status: "paid" }), dnes)).toBe(false);
    expect(
      jePoSplatnosti(f({ due_date: "2026-08-01", paid_at: "2026-08-05T10:00:00Z" }), dnes),
    ).toBe(false);
  });

  it("dobropis ani zálohová faktúra nie sú pohľadávka", () => {
    expect(jeOtvorena(f({ type: "credit_note" }))).toBe(false);
    expect(jeOtvorena(f({ type: "proforma" }))).toBe(false);
  });
});

describe("znamienkoDokladu", () => {
  it("mínus len pre dobropis", () => {
    expect(znamienkoDokladu("credit_note")).toBe(-1);
    expect(znamienkoDokladu("regular")).toBe(1);
    expect(znamienkoDokladu(null)).toBe(1);
  });
});
