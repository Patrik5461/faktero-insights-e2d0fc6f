import { describe, expect, it } from "vitest";
import {
  ohodnotSplatku,
  protistranaSedi,
  sparujSplatky,
  type OdchadzajuciPohyb,
  type SplatkaNaSparovanie,
} from "./financovanie-parovanie";

/**
 * Párovanie splátok.
 *
 * Testuje sa hlavne to, čo by narobilo škodu: aby sa platba nepriradila cudzej
 * zmluve len preto, že má rovnakú sumu. Splátky sú každý mesiac rovnaké, takže
 * je to najpravdepodobnejšia chyba celej agendy.
 */

const pohyb = (o: Partial<OdchadzajuciPohyb> = {}): OdchadzajuciPohyb => ({
  id: "p1",
  booking_date: "2026-09-15",
  amount: -188.71,
  currency: "EUR",
  variable_symbol: "123456",
  counterparty: "ČSOB Leasing, a.s.",
  description: "splatka leasingu",
  ...o,
});

const splatka = (o: Partial<SplatkaNaSparovanie> = {}): SplatkaNaSparovanie => ({
  id: "s1",
  contract_id: "z1",
  number: 1,
  due_date: "2026-09-15",
  amount: 188.71,
  currency: "EUR",
  variable_symbol: "123456",
  counterparty_hint: null,
  provider_name: "ČSOB Leasing",
  contract_name: "Octavia",
  ...o,
});

describe("hodnotenie", () => {
  it("prichádzajúca platba nie je splátka", () => {
    expect(ohodnotSplatku(pohyb({ amount: 188.71 }), splatka())).toBeNull();
  });

  it("iná mena sa nepáruje", () => {
    expect(ohodnotSplatku(pohyb({ currency: "CZK" }), splatka())).toBeNull();
  });

  it("úplne iná suma sa nepáruje", () => {
    expect(ohodnotSplatku(pohyb({ amount: -50 }), splatka())).toBeNull();
  });

  it("platba spred pol roka k tejto splátke nepatrí", () => {
    expect(ohodnotSplatku(pohyb({ booking_date: "2026-03-15" }), splatka())).toBeNull();
  });

  it("variabilný symbol a presná suma dávajú vysoké skóre", () => {
    const o = ohodnotSplatku(pohyb(), splatka())!;
    expect(o.rozpoznana).toBe(true);
    expect(o.sumaSedi).toBe(true);
    expect(o.skore).toBeGreaterThanOrEqual(0.9);
  });

  it("bez variabilného symbolu pomôže meno protistrany", () => {
    const o = ohodnotSplatku(pohyb({ variable_symbol: null }), splatka())!;
    expect(o.rozpoznana).toBe(true);
    expect(o.dovody.join(" ")).toMatch(/ČSOB/);
  });

  it("sama suma a dátum na rozpoznanie nestačia", () => {
    const o = ohodnotSplatku(
      pohyb({ variable_symbol: null, counterparty: "Neznámy", description: "" }),
      splatka({ provider_name: "ČSOB Leasing" }),
    )!;
    expect(o.rozpoznana).toBe(false);
  });
});

describe("meno protistrany", () => {
  it("nájde sa aj s diakritikou a právnou formou navyše", () => {
    expect(protistranaSedi(pohyb({ counterparty: "CSOB Leasing a. s." }), splatka())).toBe(true);
  });

  it("príliš krátky názov by sedel na hocičo", () => {
    expect(
      protistranaSedi(pohyb({ counterparty: "Hocikto" }), splatka({ provider_name: "VB" })),
    ).toBe(false);
  });
});

describe("párovanie", () => {
  it("jasná platba sa zapíše sama", () => {
    const { auto, navrhy } = sparujSplatky([pohyb()], [splatka()]);
    expect(auto).toHaveLength(1);
    expect(navrhy).toHaveLength(0);
    expect(auto[0].installmentId).toBe("s1");
  });

  it("dva leasingy s rovnakou splátkou od tej istej firmy skončia ako návrh", () => {
    // Toto je tá pasca, kvôli ktorej sa nepáruje podľa sumy. Bez rozlíšenia by
    // peniaze sadli na cudziu zmluvu a nikto by si to nevšimol.
    const { auto, navrhy } = sparujSplatky(
      [pohyb({ variable_symbol: null })],
      [
        splatka({ id: "s1", contract_id: "z1", variable_symbol: null }),
        splatka({ id: "s2", contract_id: "z2", variable_symbol: null }),
      ],
    );
    expect(auto).toHaveLength(0);
    expect(navrhy).toHaveLength(1);
  });

  it("rôzne variabilné symboly ich rozlíšia a spárujú sa samy", () => {
    const { auto } = sparujSplatky(
      [pohyb({ id: "p1", variable_symbol: "111" }), pohyb({ id: "p2", variable_symbol: "222" })],
      [
        splatka({ id: "s1", contract_id: "z1", variable_symbol: "111" }),
        splatka({ id: "s2", contract_id: "z2", variable_symbol: "222" }),
      ],
    );
    expect(auto).toHaveLength(2);
    expect(auto.find((z) => z.transactionId === "p1")!.installmentId).toBe("s1");
    expect(auto.find((z) => z.transactionId === "p2")!.installmentId).toBe("s2");
  });

  it("jeden pohyb nezaplatí dve splátky", () => {
    const { auto, navrhy } = sparujSplatky(
      [pohyb()],
      [splatka({ id: "s1", number: 1 }), splatka({ id: "s2", number: 2, due_date: "2026-09-16" })],
    );
    expect([...auto, ...navrhy]).toHaveLength(1);
  });

  it("čiastočná platba je návrh, nie automat", () => {
    const { auto, navrhy } = sparujSplatky([pohyb({ amount: -188.0 })], [splatka()]);
    expect(auto).toHaveLength(0);
    expect(navrhy).toHaveLength(1);
    expect(navrhy[0].dovody.join(" ")).toMatch(/líši/);
  });

  it("bez pohybov aj bez splátok nespadne", () => {
    expect(sparujSplatky([], [])).toEqual({ auto: [], navrhy: [] });
  });
});
