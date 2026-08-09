import { describe, it, expect } from "vitest";
import { jeHotovostny, priebehPokladne, stavPokladne } from "./pokladna";

const doklady = [
  {
    id: "1",
    entry_number: "PD20260001",
    entry_date: "2026-08-01",
    type: "prijem",
    amount: "500",
    description: "Vklad do pokladne",
  },
  {
    id: "2",
    entry_number: "PD20260002",
    entry_date: "2026-08-05",
    type: "vydaj",
    amount: "120.50",
    description: "Poštovné",
  },
];

const vydavky = [
  {
    id: "d1",
    issue_date: "2026-08-03",
    total_amount: "45.20",
    payment_method: "hotovost",
    supplier_name: "Čerpacia stanica",
  },
  {
    id: "d2",
    issue_date: "2026-08-04",
    total_amount: "300",
    payment_method: "karta",
    supplier_name: "Veľkoobchod",
  },
  {
    id: "d3",
    issue_date: "2026-08-06",
    total_amount: "80",
    payment_method: "prevod",
    supplier_name: "Telekom",
  },
];

describe("jeHotovostny", () => {
  it("bez uvedeného spôsobu berieme doklad ako hotovostný", () => {
    expect(jeHotovostny({})).toBe(true);
    expect(jeHotovostny({ payment_method: "hotovost" })).toBe(true);
  });

  // Toto je jadro celej pokladne: doklad zaplatený kartou je výdavok, ale
  // hotovosť neuberá. Bez tohto rozlíšenia by pokladňa ukazovala mínus.
  it("karta a prevod hotovosť neuberajú", () => {
    expect(jeHotovostny({ payment_method: "karta" })).toBe(false);
    expect(jeHotovostny({ payment_method: "prevod" })).toBe(false);
  });
});

describe("stavPokladne", () => {
  it("spočíta príjmy, výdavky a zostatok", () => {
    const s = stavPokladne(doklady, vydavky);
    expect(s.prijmy).toBe(500);
    // 120,50 pokladničný výdaj + 45,20 hotovostný doklad; karta ani prevod nie.
    expect(s.vydavky).toBe(165.7);
    expect(s.zostatok).toBe(334.3);
    expect(s.pocet).toBe(3);
    expect(s.zaporny).toBe(false);
  });

  it("počiatočný stav sa pripočíta", () => {
    expect(stavPokladne(doklady, vydavky, 100).zostatok).toBe(434.3);
  });

  it("prázdna pokladňa je nula, nie NaN", () => {
    const s = stavPokladne([], []);
    expect(s.zostatok).toBe(0);
    expect(s.zaporny).toBe(false);
  });

  it("záporný zostatok sa označí", () => {
    const s = stavPokladne(
      [{ entry_date: "2026-08-01", type: "vydaj", amount: 50, description: "výber" }],
      [],
    );
    expect(s.zostatok).toBe(-50);
    expect(s.zaporny).toBe(true);
  });

  // `numeric` chodí z PostgREST ako reťazec; bez prevodu na číslo by sa sumy
  // spojili do „500120.50" a zostatok by bol nezmysel.
  it("sumy ako reťazce sa sčítajú ako čísla", () => {
    const s = stavPokladne(
      [
        { entry_date: "2026-08-01", type: "prijem", amount: "0.10", description: "a" },
        { entry_date: "2026-08-02", type: "prijem", amount: "0.20", description: "b" },
      ],
      [],
    );
    expect(s.prijmy).toBe(0.3);
  });

  it("záporná suma v doklade sa berie ako kladná podľa typu", () => {
    const s = stavPokladne(
      [{ entry_date: "2026-08-01", type: "vydaj", amount: -30, description: "pokus" }],
      [],
    );
    expect(s.vydavky).toBe(30);
    expect(s.zostatok).toBe(-30);
  });
});

describe("priebehPokladne", () => {
  it("zoradí podľa dátumu a dopočíta priebežný zostatok", () => {
    const r = priebehPokladne(doklady, vydavky, 0);
    expect(r.map((x) => x.datum)).toEqual(["2026-08-01", "2026-08-03", "2026-08-05"]);
    expect(r.map((x) => x.zostatok)).toEqual([500, 454.8, 334.3]);
  });

  it("rozlíši, odkiaľ riadok pochádza", () => {
    const r = priebehPokladne(doklady, vydavky, 0);
    expect(r.map((x) => x.zdroj)).toEqual(["pokladnicny", "doklad", "pokladnicny"]);
  });

  // Bloček „BL-1" sa podľa čísla zoradil pred vklad „PD20260001" a priebežný
  // zostatok v ten deň ukázal mínus, hoci v pokladni nikdy nechýbalo.
  it("v ten istý deň idú príjmy pred výdavkami", () => {
    const r = priebehPokladne(
      [
        {
          entry_number: "PD20260001",
          entry_date: "2026-08-09",
          type: "prijem",
          amount: 500,
          description: "Vklad",
        },
      ],
      [
        {
          id: "d",
          issue_date: "2026-08-09",
          total_amount: 45.2,
          payment_method: "hotovost",
          document_number: "BL-1",
        },
      ],
    );
    expect(r.map((x) => x.typ)).toEqual(["prijem", "vydaj"]);
    expect(r.map((x) => x.zostatok)).toEqual([500, 454.8]);
    expect(r.every((x) => x.zostatok >= 0)).toBe(true);
  });

  it("doklad s nulovou sumou sa do priebehu nedostane", () => {
    const r = priebehPokladne([], [{ issue_date: "2026-08-01", total_amount: null }]);
    expect(r).toHaveLength(0);
  });
});
