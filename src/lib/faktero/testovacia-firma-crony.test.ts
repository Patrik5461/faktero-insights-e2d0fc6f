import { describe, expect, it } from "vitest";
import {
  bezTestovacich,
  bezVnorenychTestovacich,
  firmyNaZmazanieUctu,
  vnorenaJeTestovacia,
} from "./testovacia-firma-crony";

describe("vnorenaJeTestovacia / bezVnorenychTestovacich", () => {
  it("riadok s vnorenou testovacou firmou vypadne, ostatné ostanú", () => {
    const riadky = [
      { company_id: "a", companies: { testovacia_pre: null } },
      { company_id: "t", companies: { testovacia_pre: "a" } },
      { company_id: "b", companies: null },
      { company_id: "c" },
    ];
    expect(bezVnorenychTestovacich(riadky).map((r) => r.company_id)).toEqual(["a", "b", "c"]);
    expect(vnorenaJeTestovacia(riadky[1])).toBe(true);
    expect(vnorenaJeTestovacia(riadky[0])).toBe(false);
  });
});

describe("bezTestovacich", () => {
  it("vyhodí riadky testovacích firiem podľa množiny", () => {
    const riadky = [
      { id: 1, company_id: "a" },
      { id: 2, company_id: "t" },
      { id: 3, company_id: null },
    ];
    expect(bezTestovacich(riadky, new Set(["t"]), (r) => r.company_id).map((r) => r.id)).toEqual([
      1, 3,
    ]);
  });

  it("prázdna množina vráti kópiu všetkého", () => {
    const riadky = [{ company_id: "a" }];
    const out = bezTestovacich(riadky, new Set(), (r) => r.company_id);
    expect(out).toEqual(riadky);
    expect(out).not.toBe(riadky);
  });
});

describe("firmyNaZmazanieUctu", () => {
  it("maže len skutočné firmy, kde je človek sám; testovaciu zmaže rodič", () => {
    expect(
      firmyNaZmazanieUctu([
        { id: "sama", clenov: 1, testovacia_pre: null },
        { id: "test-samej", clenov: 1, testovacia_pre: "sama" },
        { id: "zdielana", clenov: 2, testovacia_pre: null },
        { id: "test-zdielanej", clenov: 2, testovacia_pre: "zdielana" },
      ]),
    ).toEqual(["sama"]);
  });

  it("osamelá testovacia firma (rodič má viac členov) sa samostatne nemaže", () => {
    expect(firmyNaZmazanieUctu([{ id: "t", clenov: 1, testovacia_pre: "rodic" }])).toEqual([]);
  });
});
