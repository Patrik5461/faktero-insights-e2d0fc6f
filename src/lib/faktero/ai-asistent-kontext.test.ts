import { describe, expect, it } from "vitest";
import {
  MAX_SPRAV_HISTORIE,
  najvacsiDlznici,
  pokynJazyka,
  poslednychVPoradi,
  sumaVDomacejMene,
  sumyPodlaMeny,
} from "./ai-asistent-kontext";

// Stav QA Česká s.r.o. 30. 10.: 2 faktúry v CZK a 4 v EUR po splatnosti.
const czFirma = [
  { total: 1000, currency: "CZK", customer_name: "Odběratel a.s." },
  { total: 10210, currency: "CZK", customer_name: "Odběratel a.s." },
  ...Array.from({ length: 4 }, () => ({
    total: 1210,
    currency: "EUR",
    customer_name: "Odběratel a.s.",
  })),
];

describe("sumy po splatnosti podľa meny", () => {
  it("nesčíta koruny s eurami (asistent hlásil 16 050 CZK)", () => {
    expect(sumyPodlaMeny(czFirma, "CZK")).toEqual([
      { mena: "CZK", suma: 11210, pocet: 2 },
      { mena: "EUR", suma: 4840, pocet: 4 },
    ]);
    expect(sumaVDomacejMene(czFirma, "CZK")).toBe(11210);
  });
  it("faktúra bez meny je v domácej mene, halier sa nezaokrúhli preč", () => {
    expect(sumyPodlaMeny([{ total: "0.1" }, { total: "0.2", currency: "eur" }], "EUR")).toEqual([
      { mena: "EUR", suma: 0.3, pocet: 2 },
    ]);
    expect(sumaVDomacejMene([], "EUR")).toBe(0);
  });
  it("domáca mena ide prvá, aj keď je menšia", () => {
    expect(
      sumyPodlaMeny(
        [
          { total: 5, currency: "EUR" },
          { total: 900, currency: "USD" },
        ],
        "EUR",
      ).map((s) => s.mena),
    ).toEqual(["EUR", "USD"]);
  });
});

describe("najväčší dlžníci", () => {
  it("ten istý odberateľ v dvoch menách sú dva riadky", () => {
    expect(najvacsiDlznici(czFirma, "CZK")).toEqual([
      { name: "Odběratel a.s.", total: 11210, currency: "CZK" },
      { name: "Odběratel a.s.", total: 4840, currency: "EUR" },
    ]);
  });
  it("bez mena odberateľa sa riadok vynechá a vráti sa najviac päť", () => {
    const r = Array.from({ length: 8 }, (_, i) => ({ total: i, customer_name: `F${i}` }));
    expect(najvacsiDlznici([...r, { total: 999, customer_name: "  " }], "EUR")).toHaveLength(5);
    expect(najvacsiDlznici(r, "EUR")[0]).toEqual({ name: "F7", total: 7, currency: "EUR" });
  });
});

describe("história rozhovoru", () => {
  it("po 30 správach berie posledné, nie prvé — nová otázka nesmie vypadnúť", () => {
    const odNajnovsej = Array.from({ length: 40 }, (_, i) => ({ n: 40 - i }));
    const h = poslednychVPoradi(odNajnovsej);
    expect(h).toHaveLength(MAX_SPRAV_HISTORIE);
    expect(h[0]).toEqual({ n: 11 });
    expect(h[h.length - 1]).toEqual({ n: 40 });
    expect(poslednychVPoradi(null)).toEqual([]);
  });
});

describe("jazyk odpovede", () => {
  it("riadi sa jazykom otázky, inak jazykom aplikácie", () => {
    expect(pokynJazyka("cs")).toContain("v češtine");
    expect(pokynJazyka("de")).toContain("v nemčine");
    expect(pokynJazyka(undefined)).toContain("v slovenčine");
    expect(pokynJazyka("xx")).toContain("v slovenčine");
    expect(pokynJazyka("sk")).toMatch(/posledná otázka/);
  });
});
