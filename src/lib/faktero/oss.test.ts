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
      {
        cislo: "4",
        datum: "2026-08-20",
        stat: "DE",
        opravny: true,
        riadky: [{ sadzba: 19, zaklad: 100, dan: 19 }],
      },
    ]);
    expect(p.riadky.find((r) => r.stat === "DE")).toMatchObject({ zaklad: 200, dan: 38 });
  });

  it("záporne uložený dobropis (formulár) sa neotáča druhýkrát", () => {
    const p = ossPrehlad([
      ...doklady,
      {
        cislo: "4",
        datum: "2026-08-20",
        stat: "DE",
        opravny: true,
        riadky: [{ sadzba: 19, zaklad: -100, dan: -19 }],
      },
    ]);
    expect(p.riadky.find((r) => r.stat === "DE")).toMatchObject({ zaklad: 200, dan: 38 });
    expect(p.danSpolu).toBe(48);
  });

  it("štát mimo EÚ a nulová sadzba sa ozvú", () => {
    const p = ossPrehlad([
      {
        cislo: "5",
        datum: "2026-08-20",
        stat: "US",
        riadky: [{ sadzba: 19, zaklad: 10, dan: 1.9 }],
      },
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

describe("OSS — prepočet kurzom ECB k poslednému dňu štvrťroka (čl. 366 smernice 2006/112/ES)", () => {
  const kurzy = new Map([
    ["CZK|2026-09-30", { kurz: 25, den: "2026-09-30", predbezne: false }],
    ["PLN|2026-09-30", { kurz: 4, den: "2026-09-30", predbezne: false }],
    ["CZK|2026-06-30", { kurz: 24, den: "2026-06-30", predbezne: false }],
  ]);

  it("koniec štvrťroka podľa dátumu dokladu", async () => {
    const { koniecStvrtroka } = await import("./oss");
    expect(koniecStvrtroka("2026-01-15")).toBe("2026-03-31");
    expect(koniecStvrtroka("2026-05-31")).toBe("2026-06-30");
    expect(koniecStvrtroka("2026-09-01")).toBe("2026-09-30");
    expect(koniecStvrtroka("2024-12-31")).toBe("2024-12-31");
  });

  it("euro je 1, cudzia mena kurzom ku koncu štvrťroka — nie kurzom z dokladu", async () => {
    const { eurZaJednotkuOss } = await import("./oss");
    expect(eurZaJednotkuOss({ currency: "EUR" }, "SK", kurzy)).toBe(1);
    expect(eurZaJednotkuOss({ currency: null }, "SK", kurzy)).toBe(1);
    // Doklad z 2. 7. má na sebe kurz ECB z 1. 7.; OSS berie 30. 9.
    expect(
      eurZaJednotkuOss({ currency: "CZK", delivery_date: "2026-07-02" }, "SK", kurzy),
    ).toBeCloseTo(0.04, 6);
    expect(
      eurZaJednotkuOss({ currency: "PLN", issue_date: "2026-08-15" }, "DE", kurzy),
    ).toBeCloseTo(0.25, 6);
    // Iný štvrťrok — iný kurz.
    expect(
      eurZaJednotkuOss({ currency: "CZK", delivery_date: "2026-04-10" }, "SK", kurzy),
    ).toBeCloseTo(1 / 24, 6);
  });

  it("česká firma v korunách sa prepočíta kurzom ECB pre CZK", async () => {
    const { eurZaJednotkuOss } = await import("./oss");
    expect(
      eurZaJednotkuOss({ currency: null, delivery_date: "2026-09-10" }, "CZ", kurzy),
    ).toBeCloseTo(0.04, 6);
    expect(eurZaJednotkuOss({ currency: "EUR" }, "CZ", kurzy)).toBe(1);
  });

  it("bez kurzu nevymýšľa kurz 1", async () => {
    const { eurZaJednotkuOss } = await import("./oss");
    expect(
      eurZaJednotkuOss({ currency: "USD", delivery_date: "2026-09-10" }, "SK", kurzy),
    ).toBeNull();
    expect(eurZaJednotkuOss({ currency: "CZK" }, "SK", kurzy)).toBeNull();
  });

  it("zoznam potrebných kurzov — mena × koniec štvrťroka, bez eura", async () => {
    const { potrebneKurzyOss } = await import("./oss");
    expect(
      potrebneKurzyOss(
        [
          { currency: "CZK", delivery_date: "2026-07-02" },
          { currency: "CZK", issue_date: "2026-09-29" },
          { currency: "EUR", delivery_date: "2026-07-02" },
          { currency: "PLN", delivery_date: "2026-02-02" },
        ],
        "SK",
      ),
    ).toEqual([
      { mena: "CZK", den: "2026-09-30" },
      { mena: "PLN", den: "2026-03-31" },
    ]);
  });

  it("deň bez kurzu ECB (víkend, sviatok) → najbližší nasledujúci zverejnený", async () => {
    const { kurzOdDatumu } = await import("./kurzy");
    const zverejnene = [
      { den: "2024-03-27", mena: "CZK", kurz: 25.3 },
      { den: "2024-03-28", mena: "CZK", kurz: 25.31 },
      // 29. 3. Veľký piatok, 31. 3. nedeľa, 1. 4. Veľkonočný pondelok — ECB nepublikuje.
      { den: "2024-04-02", mena: "CZK", kurz: 25.4 },
      { den: "2024-04-03", mena: "CZK", kurz: 25.41 },
    ];
    expect(kurzOdDatumu(zverejnene, "czk", "2024-03-31")).toEqual({
      den: "2024-04-02",
      mena: "CZK",
      kurz: 25.4,
    });
    expect(kurzOdDatumu(zverejnene, "CZK", "2024-03-28")?.kurz).toBe(25.31);
    expect(kurzOdDatumu(zverejnene, "CZK", "2024-04-04")).toBeNull();
  });
});
