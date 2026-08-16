import { describe, it, expect } from "vitest";
import {
  jePouzitelna,
  normalizujOdpoved,
  normalizujSplatky,
  vyhradyKuKalendaru,
} from "./financovanie-citanie";

/**
 * Zmluva je záväzný dokument, model nie je spoľahlivý zdroj. Tieto testy
 * strážia hranicu medzi tým, čo sa smie prevziať, a tým, čo sa musí ukázať
 * človeku ako výhrada.
 */

describe("normalizujSplatky", () => {
  it("zoradí riadky podľa splatnosti a prečísluje ich od jednotky", () => {
    const r = normalizujSplatky([
      { number: 3, due_date: "2026-08-19", amount: 100 },
      { number: 1, due_date: "2026-06-19", amount: 100 },
      { number: 2, due_date: "2026-07-19", amount: 100 },
    ]);
    expect(r.map((x) => x.number)).toEqual([1, 2, 3]);
    expect(r.map((x) => x.due_date)).toEqual(["2026-06-19", "2026-07-19", "2026-08-19"]);
  });

  it("prečíta sumy zapísané po slovensky", () => {
    const r = normalizujSplatky([
      { number: 1, due_date: "2026-06-19", amount: "1 234,56", principal_part: "1 000,00" },
    ]);
    expect(r[0].amount).toBe(1234.56);
    expect(r[0].principal_part).toBe(1000);
  });

  it("zahodí riadky bez dátumu alebo bez sumy", () => {
    // Hlavička tabuľky a súčtový riadok chodia z modelu ako obyčajné riadky.
    const r = normalizujSplatky([
      { number: 1, due_date: "Splatnosť", amount: "Suma" },
      { number: 2, due_date: "2026-06-19", amount: 100 },
      { number: 3, due_date: "2026-07-19", amount: 0 },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].due_date).toBe("2026-06-19");
  });

  it("nedopĺňa chýbajúci rozpad — dá nulu, nie odhad", () => {
    const r = normalizujSplatky([{ number: 1, due_date: "2026-06-19", amount: 100 }]);
    expect(r[0].principal_part).toBe(0);
    expect(r[0].interest_part).toBe(0);
    expect(r[0].remaining_principal).toBe(0);
  });

  it("z nezmyslu urobí prázdny kalendár, nie výnimku", () => {
    expect(normalizujSplatky(null)).toEqual([]);
    expect(normalizujSplatky("nie je pole")).toEqual([]);
  });
});

describe("vyhradyKuKalendaru", () => {
  const riadok = (n: number, istina: number) => ({
    number: n,
    due_date: `2026-0${n}-19`,
    amount: istina + 10,
    principal_part: istina,
    interest_part: 10,
    vat_amount: 0,
    remaining_principal: 0,
  });

  it("mlčí, keď súčet istín sedí s financovanou sumou", () => {
    const v = vyhradyKuKalendaru({
      principal: 300,
      splatky: [riadok(1, 100), riadok(2, 100), riadok(3, 100)],
      term_months: 3,
    });
    expect(v).toEqual([]);
  });

  it("ozve sa, keď sa súčet istín rozchádza s financovanou sumou", () => {
    const v = vyhradyKuKalendaru({
      principal: 5000,
      splatky: [riadok(1, 100), riadok(2, 100)],
      term_months: 2,
    });
    expect(v.join(" ")).toMatch(/Súčet istín/);
  });

  it("ozve sa, keď počet riadkov nesedí s počtom splátok zo zmluvy", () => {
    const v = vyhradyKuKalendaru({
      principal: 200,
      splatky: [riadok(1, 100), riadok(2, 100)],
      term_months: 36,
    });
    expect(v.join(" ")).toMatch(/36 splátkach/);
  });

  it("povie, že kalendár nemá rozpad na istinu a úrok", () => {
    const v = vyhradyKuKalendaru({
      principal: null,
      splatky: [
        {
          number: 1,
          due_date: "2026-06-19",
          amount: 100,
          principal_part: 0,
          interest_part: 0,
          vat_amount: 0,
          remaining_principal: 0,
        },
      ],
      term_months: 1,
    });
    expect(v.join(" ")).toMatch(/rozpad/);
  });

  it("povie, keď kalendár v dokumente vôbec nebol", () => {
    const v = vyhradyKuKalendaru({ principal: 1000, splatky: [], term_months: 12 });
    expect(v.join(" ")).toMatch(/nenašiel splátkový kalendár/);
  });
});

describe("normalizujOdpoved", () => {
  it("počet splátok a prvú splatnosť berie z kalendára, nie z vety v zmluve", () => {
    const z = normalizujOdpoved({
      kind: "leasing",
      term_months: 36,
      first_due_date: "2030-01-01",
      principal: 300,
      splatky: [
        { number: 1, due_date: "2026-06-19", amount: 110, principal_part: 100, interest_part: 10 },
        { number: 2, due_date: "2026-07-19", amount: 110, principal_part: 100, interest_part: 10 },
        { number: 3, due_date: "2026-08-19", amount: 110, principal_part: 100, interest_part: 10 },
      ],
    });
    expect(z.term_months).toBe(3);
    expect(z.first_due_date).toBe("2026-06-19");
    // Rozpor so zmluvou sa nezamlčí.
    expect(z.vyhrady.join(" ")).toMatch(/36 splátkach/);
  });

  it("chýbajúcu prvú splatnosť povie, namiesto aby dosadila dnešok", () => {
    // Spätne zapísaná zmluva bez čitateľného dátumu: dosadený dnešok by posunul
    // celý kalendár o roky a vyzeral by ako údaj zo zmluvy.
    const z = normalizujOdpoved({ kind: "uver", principal: 1000, splatky: [] });
    expect(z.first_due_date).toBeNull();
    expect(z.vyhrady.join(" ")).toMatch(/Splatnosť prvej splátky/);
  });

  it("keď je kalendár prečítaný, o prvú splatnosť sa nesťažuje", () => {
    const z = normalizujOdpoved({
      kind: "uver",
      principal: 200,
      splatky: [
        { number: 1, due_date: "2025-02-20", amount: 110, principal_part: 100, interest_part: 10 },
        { number: 2, due_date: "2025-03-20", amount: 110, principal_part: 100, interest_part: 10 },
      ],
    });
    expect(z.first_due_date).toBe("2025-02-20");
    expect(z.vyhrady.join(" ")).not.toMatch(/Splatnosť prvej splátky/);
  });

  it("neznámy druh nechá na človeku a nehádže leasing naslepo", () => {
    const z = normalizujOdpoved({ kind: "nieco ine", principal: 1000, splatky: [] });
    expect(z.kind).toBeNull();
  });

  it("prázdna odpoveď nie je použiteľná", () => {
    expect(jePouzitelna(normalizujOdpoved({}))).toBe(false);
    expect(jePouzitelna(normalizujOdpoved({ principal: 1000 }))).toBe(true);
  });
});
