import { describe, expect, it } from "vitest";
import { prejdeFiltrom, stav, sucetMesiaca } from "./VystaveneFaktury";

/*
  Zoznam faktúr v appke (test 30. 10. 2026): súčet mesiaca sčítaval všetko
  vrátane zálohových faktúr a daňových dokladov k platbe a dobropis svietil
  červeným „Po splatnosti". Prehľad pritom počítal podľa typu dokladu.
*/
const VCERA = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

const f = (o: Record<string, unknown>) =>
  ({
    status: "issued",
    type: "regular",
    total: 100,
    currency: "EUR",
    due_date: VCERA,
    ...o,
  }) as any;

describe("súčet mesiaca v zozname faktúr", () => {
  it("záloha a doklad k platbe sa nepripočítajú, dobropis odpočíta", () => {
    const s = sucetMesiaca([
      f({ total: 123 }),
      f({ type: "proforma", total: 123 }),
      f({ type: "advance_payment", total: 123 }),
      f({ type: "credit_note", total: -23 }),
      f({ status: "cancelled", total: 50 }),
      f({ status: "draft", total: 70 }),
    ]);
    expect(s).toEqual({ spolu: 100, mena: "EUR" });
  });

  it("rôzne meny sa nesčítajú", () => {
    expect(sucetMesiaca([f({}), f({ currency: "CZK" })])).toBeNull();
  });
});

describe("dobropis v zozname", () => {
  it("nie je po splatnosti ani neuhradený", () => {
    const d = f({ type: "credit_note", total: -12.3 });
    expect(stav(d).kluc).toBe("faktury.stav.dobropis");
    expect(prejdeFiltrom(d, "neuhradene")).toBe(false);
    expect(prejdeFiltrom(d, "poSplatnosti")).toBe(false);
    expect(prejdeFiltrom(d, "vsetky")).toBe(true);
  });

  it("bežná faktúra po splatnosti ostáva po splatnosti", () => {
    expect(stav(f({})).kluc).toBe("faktury.stav.poSplatnosti");
    expect(prejdeFiltrom(f({}), "poSplatnosti")).toBe(true);
  });
});
