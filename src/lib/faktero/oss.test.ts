import { describe, expect, it } from "vitest";
import { ossPrehlad, stavPrahu, stvrtrokDna } from "./oss";
import { sadzbyStatu, zakladnaSadzbaStatu } from "./sadzby-eu";

describe("sadzby členských štátov", () => {
  it("pozná základnú aj znížené sadzby", () => {
    expect(zakladnaSadzbaStatu("DE")).toBe(19);
    expect(sadzbyStatu("DE")).toEqual([19, 7, 0]);
    expect(zakladnaSadzbaStatu("HU")).toBe(27);
  });

  it("neznámy štát nezhodí výber, ponúkne aspoň nulu", () => {
    expect(sadzbyStatu("XX")).toEqual([0]);
  });
});

describe("prehľad OSS", () => {
  const doklady = [
    { cislo: "1", datum: "2026-07-05", stat: "DE", riadky: [{ sadzba: 19, zaklad: 100, dan: 19 }] },
    { cislo: "2", datum: "2026-08-05", stat: "DE", riadky: [{ sadzba: 19, zaklad: 200, dan: 38 }] },
    { cislo: "3", datum: "2026-08-06", stat: "AT", riadky: [{ sadzba: 20, zaklad: 50, dan: 10 }] },
  ];

  it("sčíta sa po štátoch a sadzbách", () => {
    const p = ossPrehlad(doklady);
    expect(p.riadky).toHaveLength(2);
    expect(p.riadky[0]).toMatchObject({ stat: "AT", sadzba: 20, zaklad: 50, dan: 10 });
    expect(p.riadky[1]).toMatchObject({ stat: "DE", zaklad: 300, dan: 57 });
    expect(p.danSpolu).toBe(67);
  });

  it("dobropis odpočítava", () => {
    const p = ossPrehlad([
      ...doklady,
      { cislo: "4", datum: "2026-08-20", stat: "DE", opravny: true, riadky: [{ sadzba: 19, zaklad: 100, dan: 19 }] },
    ]);
    expect(p.riadky.find((r) => r.stat === "DE")).toMatchObject({ zaklad: 200, dan: 38 });
  });

  it("štát mimo EÚ a nulová sadzba sa ozvú", () => {
    const p = ossPrehlad([
      { cislo: "5", datum: "2026-08-20", stat: "US", riadky: [{ sadzba: 19, zaklad: 10, dan: 1.9 }] },
      { cislo: "6", datum: "2026-08-20", stat: "DE", riadky: [{ sadzba: 0, zaklad: 10, dan: 0 }] },
    ]);
    expect(p.riadky).toHaveLength(0);
    expect(p.vytky).toHaveLength(2);
  });
});

describe("hranica 10 000 €", () => {
  it("ráta sa spolu za všetky štáty, nie za každý zvlášť", () => {
    expect(stavPrahu(9500)).toMatchObject({ prekroceny: false, zostava: 500 });
    expect(stavPrahu(10000).prekroceny).toBe(false);
    expect(stavPrahu(10000.01)).toMatchObject({ prekroceny: true, zostava: 0 });
  });
});

describe("zaradenie do štvrťroka", () => {
  it("mesiac určí štvrťrok", () => {
    expect(stvrtrokDna("2026-01-31")).toEqual({ rok: 2026, stvrtrok: 1 });
    expect(stvrtrokDna("2026-12-01")).toEqual({ rok: 2026, stvrtrok: 4 });
  });
});
