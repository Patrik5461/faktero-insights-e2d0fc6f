import { describe, it, expect } from "vitest";
import { ohodnotDoklad, sparujDoklady, type Pohyb, type Vydavok } from "./doklad-parovanie";

const pohyb = (z: Partial<Pohyb> = {}): Pohyb => ({
  id: "p1",
  booking_date: "2026-08-12",
  amount: -45.9,
  currency: "EUR",
  variable_symbol: null,
  counterparty: "SLOVNAFT a.s.",
  description: "Platba kartou",
  ...z,
});

const vydavok = (z: Partial<Vydavok> = {}): Vydavok => ({
  id: "v1",
  supplier_name: "Slovnaft a. s.",
  document_number: null,
  issue_date: "2026-08-10",
  total_amount: 45.9,
  currency: "EUR",
  payment_method: "karta",
  ...z,
});

describe("párovanie dokladu s pohybom na účte", () => {
  it("suma na cent a meno obchodníka stačia na istotu", () => {
    const o = ohodnotDoklad(pohyb(), vydavok());
    expect(o?.istota).toBe("auto");
    expect(o?.dovody.join(" ")).toMatch(/Slovnaft/);
  });

  it("samotná zhoda sumy je len návrh", () => {
    // Neznámy obchodník, žiadny symbol — zhodných čiastok býva za týždeň viac.
    const o = ohodnotDoklad(pohyb({ counterparty: "XYZ 4821", description: "Nákup" }), vydavok());
    expect(o?.istota).toBe("navrh");
  });

  it("hotovosť sa nepáruje nikdy", () => {
    expect(ohodnotDoklad(pohyb(), vydavok({ payment_method: "hotovost" }))).toBeNull();
  });

  it("iná suma nie je čiastočná úhrada, ale iný nákup", () => {
    expect(ohodnotDoklad(pohyb({ amount: -45.8 }), vydavok())).toBeNull();
    expect(ohodnotDoklad(pohyb({ amount: -90.0 }), vydavok())).toBeNull();
  });

  it("prichádzajúca platba ani iná mena k nákladu nepatria", () => {
    expect(ohodnotDoklad(pohyb({ amount: 45.9 }), vydavok())).toBeNull();
    expect(ohodnotDoklad(pohyb({ currency: "CZK" }), vydavok())).toBeNull();
  });

  it("pohyb spred dokladu to byť nemôže a starší než okno tiež nie", () => {
    expect(ohodnotDoklad(pohyb({ booking_date: "2026-08-09" }), vydavok())).toBeNull();
    expect(ohodnotDoklad(pohyb({ booking_date: "2026-08-20" }), vydavok())).toBeNull();
    // Vo vnútri okna to prejde.
    expect(ohodnotDoklad(pohyb({ booking_date: "2026-08-14" }), vydavok())).not.toBeNull();
  });

  it("prevod má kratšie okno než karta", () => {
    const prevodom = vydavok({ payment_method: "prevod" });
    expect(ohodnotDoklad(pohyb({ booking_date: "2026-08-13" }), prevodom)).not.toBeNull();
    expect(ohodnotDoklad(pohyb({ booking_date: "2026-08-15" }), prevodom)).toBeNull();
  });

  it("variabilný symbol váži viac než meno", () => {
    const sVs = ohodnotDoklad(
      pohyb({ variable_symbol: "2026114", counterparty: "neznáme" }),
      vydavok({ document_number: "2026114", supplier_name: "Iný dodávateľ" }),
    );
    expect(sVs?.istota).toBe("auto");
    expect(sVs?.skore).toBeGreaterThan(0.7);
  });
});

describe("rozdelenie na dvojice", () => {
  it("jeden pohyb uhradí najviac jeden doklad", () => {
    const zhody = sparujDoklady(
      [pohyb()],
      [vydavok(), vydavok({ id: "v2", issue_date: "2026-08-11" })],
    );
    expect(zhody).toHaveLength(1);
    expect(zhody[0].transactionId).toBe("p1");
  });

  it("dva rovnako dobré pohyby na jeden doklad znamenajú návrh, nie istotu", () => {
    const zhody = sparujDoklady([pohyb({ id: "p1" }), pohyb({ id: "p2" })], [vydavok()]);
    expect(zhody).toHaveLength(1);
    expect(zhody[0].istota).toBe("navrh");
    expect(zhody[0].dovody.join(" ")).toMatch(/rozhodnite ručne/);
  });

  it("nič nesedí — nič sa nevymyslí", () => {
    expect(sparujDoklady([pohyb({ amount: -12 })], [vydavok()])).toEqual([]);
    expect(sparujDoklady([], [vydavok()])).toEqual([]);
  });
});
