import { describe, it, expect } from "vitest";
import { cielovyStav, navrhniObjednavku, navrhniObjednavky } from "./stock-doobjednanie";

const ZAKLAD = {
  stock_item_id: "a",
  sku: "PVC-110",
  nazov: "PVC rúra 110",
  unit: "ks",
  on_hand: 0,
  reserved: 0,
  min_stock: 10,
  optimal_stock: 40,
};

describe("cielovyStav", () => {
  it("dopĺňa po optimum, nie po minimum", () => {
    expect(cielovyStav(10, 40)).toBe(40);
  });

  it("bez optima dopĺňa aspoň po minimum", () => {
    expect(cielovyStav(10, 0)).toBe(10);
    expect(cielovyStav(10, null)).toBe(10);
  });

  it("optimum pod minimom je preklep — platí to vyššie", () => {
    expect(cielovyStav(30, 5)).toBe(30);
  });

  it("nezmyselné hodnoty nezhodia výpočet", () => {
    expect(cielovyStav(-5, -5)).toBe(0);
    expect(cielovyStav("nic", undefined)).toBe(0);
  });
});

describe("navrhniObjednavku", () => {
  it("prázdny sklad objedná až po optimum", () => {
    const n = navrhniObjednavku(ZAKLAD)!;
    expect(n.objednat).toBe(40);
    expect(n.cielovy_stav).toBe(40);
    expect(n.available).toBe(0);
  });

  it("zásoba nad hranicou sa nehlási", () => {
    expect(navrhniObjednavku({ ...ZAKLAD, on_hand: 11 })).toBeNull();
  });

  it("presne na hranici sa už hlási", () => {
    const n = navrhniObjednavku({ ...ZAKLAD, on_hand: 10 })!;
    expect(n.objednat).toBe(30);
  });

  // Toto je dôvod, prečo Pohoda vedie optimum: doplnenie po minimum znamená,
  // že zásoba je hneď po dodávke znova na hranici.
  it("bez optima doplní len po minimum", () => {
    const n = navrhniObjednavku({ ...ZAKLAD, optimal_stock: 0 })!;
    expect(n.objednat).toBe(10);
    expect(n.cielovy_stav).toBe(10);
  });

  it("rezervovaný tovar sa počíta ako chýbajúci", () => {
    const n = navrhniObjednavku({ ...ZAKLAD, on_hand: 50, reserved: 45 })!;
    expect(n.available).toBe(5);
    expect(n.objednat).toBe(35);
  });

  it("plný sklad, ktorý je celý rezervovaný, treba objednať ako prázdny", () => {
    const n = navrhniObjednavku({ ...ZAKLAD, on_hand: 100, reserved: 100 })!;
    expect(n.objednat).toBe(40);
  });

  it("bez nastavenej hranice sa zásoba nehlási vôbec", () => {
    expect(navrhniObjednavku({ ...ZAKLAD, min_stock: 0, optimal_stock: 0 })).toBeNull();
  });

  it("záporný stav objedná aj to, čo chýba do nuly", () => {
    const n = navrhniObjednavku({ ...ZAKLAD, on_hand: -6 })!;
    expect(n.objednat).toBe(46);
  });

  it("desatinné množstvá nezanechajú chvost v pohyblivej čiarke", () => {
    const n = navrhniObjednavku({ ...ZAKLAD, on_hand: 0.3, min_stock: 1, optimal_stock: 1 })!;
    expect(n.objednat).toBe(0.7);
  });
});

describe("navrhniObjednavky", () => {
  it("radí od najväčšieho nedostatku a vynechá tie, čo stačia", () => {
    const out = navrhniObjednavky([
      { ...ZAKLAD, stock_item_id: "malo", on_hand: 9 },
      { ...ZAKLAD, stock_item_id: "vela", on_hand: 100 },
      { ...ZAKLAD, stock_item_id: "nic", on_hand: 0 },
    ]);
    expect(out.map((n) => n.stock_item_id)).toEqual(["nic", "malo"]);
  });
});
