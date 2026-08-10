import { describe, it, expect } from "vitest";
import { normMeno, normVs, ohodnot, sparuj, zostatok, type Doklad, type Pohyb } from "./parovanie";

function pohyb(p: Partial<Pohyb> = {}): Pohyb {
  return {
    id: "t1",
    booking_date: "2026-07-31",
    amount: 4810,
    currency: "EUR",
    variable_symbol: "2026038",
    counterparty: "nuu s.r.o.",
    description: "Tobify s. r. o.: 2026038 - nuu s.r.o.",
    ...p,
  };
}

function doklad(d: Partial<Doklad> = {}): Doklad {
  return {
    id: "f1",
    invoice_number: "2026038",
    variable_symbol: "2026038",
    total: 4810,
    uhradene: 0,
    currency: "EUR",
    status: "issued",
    issue_date: "2026-07-31",
    customer_name: "nuu s.r.o.",
    ...d,
  };
}

describe("normalizácia", () => {
  it("z čísla faktúry ostanú číslice bez vedúcich núl", () => {
    expect(normVs("ZAL12026001")).toBe("12026001");
    expect(normVs("0002026038")).toBe("2026038");
    expect(normVs(null)).toBe("");
  });

  it("meno bez diakritiky a právnej formy", () => {
    expect(normMeno("nuu s.r.o.")).toBe("nuu");
    expect(normMeno("Mima Production s. r. o.")).toBe("mima production");
    expect(normMeno("PSC n.o.")).toBe("psc");
  });

  it("zostatok nejde pod nulu ani pri preplatku", () => {
    expect(zostatok(doklad({ total: 100, uhradene: 120 }))).toBe(0);
    expect(zostatok(doklad({ total: 100, uhradene: 40 }))).toBe(60);
  });
});

describe("ohodnotenie dvojice", () => {
  it("VS aj suma sedia", () => {
    const o = ohodnot(pohyb(), doklad())!;
    expect(o.vsSedi).toBe(true);
    expect(o.sumaSedi).toBe(true);
    expect(o.skore).toBeGreaterThan(0.9);
  });

  it("odchádzajúca platba sa nepáruje", () => {
    expect(ohodnot(pohyb({ amount: -4810 }), doklad())).toBeNull();
  });

  it("iná mena sa spárovať nedá", () => {
    expect(ohodnot(pohyb({ currency: "CZK" }), doklad())).toBeNull();
  });

  it("už uhradená ani stornovaná faktúra platbu neprijme", () => {
    expect(ohodnot(pohyb(), doklad({ status: "paid" }))).toBeNull();
    expect(ohodnot(pohyb(), doklad({ status: "cancelled" }))).toBeNull();
    // Rozpísaná faktúra ešte nie je pohľadávka.
    expect(ohodnot(pohyb(), doklad({ status: "draft" }))).toBeNull();
  });

  it("plne uhradená faktúra sa už neponúka", () => {
    expect(ohodnot(pohyb(), doklad({ uhradene: 4810 }))).toBeNull();
  });

  it("čiastočná úhrada je slabší, ale platný signál", () => {
    const o = ohodnot(pohyb({ amount: 1000 }), doklad())!;
    expect(o.sumaSedi).toBe(false);
    expect(o.dovody.join(" ")).toContain("čiastočná");
  });

  it("platba dávno pred vystavením faktúry sa strháva", () => {
    const skoro = ohodnot(pohyb({ booking_date: "2026-05-01" }), doklad())!;
    const vcas = ohodnot(pohyb(), doklad())!;
    expect(skoro.skore).toBeLessThan(vcas.skore);
    expect(skoro.dovody.join(" ")).toContain("pred vystavením");
  });

  it("číslo faktúry v popise pomôže aj bez variabilného symbolu", () => {
    const o = ohodnot(pohyb({ variable_symbol: null }), doklad())!;
    expect(o.vsSedi).toBe(false);
    expect(o.dovody.join(" ")).toContain("v popise platby");
  });
});

describe("párovanie účtu", () => {
  /* Skutočné pohyby z účtu Tobify — vrátane tých, ktoré k faktúre nepatria. */
  const pohyby: Pohyb[] = [
    pohyb({ id: "t-4810", amount: 4810, variable_symbol: "2026038", booking_date: "2026-07-31" }),
    pohyb({
      id: "t-150",
      amount: 150,
      variable_symbol: "2026037",
      counterparty: "nuu s.r.o.",
      description: "Tobify s. r. o.: 2026037 - nuu s.r.o.",
      booking_date: "2026-07-21",
    }),
    pohyb({
      id: "t-gopay",
      amount: 33.98,
      variable_symbol: "9056879908",
      counterparty: "GOPAY CZECH ODŠTĚPNÝ ZÁVOD",
      description: "VS: 9056879908, SS: 5080505743, Vyuctovanie",
      booking_date: "2026-08-05",
    }),
    pohyb({
      id: "t-aukro",
      amount: 70,
      variable_symbol: "6620253",
      counterparty: "AUKRO SK s. r. o.",
      description: "Ponuka 7114442748 od kupujuceho",
      booking_date: "2026-06-29",
    }),
  ];

  const doklady: Doklad[] = [
    doklad({ id: "f-4810", invoice_number: "2026038", total: 4810, issue_date: "2026-07-31" }),
    doklad({
      id: "f-150",
      invoice_number: "2026037",
      variable_symbol: "2026037",
      total: 150,
      issue_date: "2026-07-21",
    }),
    // Rovnaká suma ako platba z Aukra, ale iný VS aj odberateľ.
    doklad({
      id: "f-70",
      invoice_number: "2026039",
      variable_symbol: "2026039",
      total: 70,
      issue_date: "2026-08-08",
      customer_name: "Ana Bobáňová",
    }),
  ];

  const { auto, navrhy } = sparuj(pohyby, doklady);

  it("faktúry so sediacim VS a sumou sa spárujú samé", () => {
    expect(auto.map((z) => z.invoiceId).sort()).toEqual(["f-150", "f-4810"]);
    expect(auto.every((z) => !z.ciastocna)).toBe(true);
    expect(auto.find((z) => z.invoiceId === "f-4810")!.suma).toBe(4810);
  });

  it("cudzie platby sa neprilepia k ničomu", () => {
    const vsetky = [...auto, ...navrhy].map((z) => z.transactionId);
    expect(vsetky).not.toContain("t-gopay");
    // Zhodná suma sama osebe nestačí: iný odberateľ, iný VS a platba mesiac
    // pred vystavením faktúry.
    expect(vsetky).not.toContain("t-aukro");
  });

  it("jeden pohyb neuhradí dve faktúry", () => {
    const idcka = [...auto, ...navrhy].map((z) => z.transactionId);
    expect(new Set(idcka).size).toBe(idcka.length);
  });

  it("čiastočná platba je návrh, nie automatika", () => {
    const r = sparuj([pohyb({ id: "t-cast", amount: 2000 })], [doklad({ id: "f-cel" })]);
    expect(r.auto).toEqual([]);
    expect(r.navrhy[0]).toMatchObject({ invoiceId: "f-cel", suma: 2000, ciastocna: true });
  });

  it("z pohybu sa nikdy nezapíše viac, než faktúre chýba", () => {
    const r = sparuj(
      [pohyb({ id: "t-viac", amount: 5000 })],
      [doklad({ id: "f-menej", total: 4810 })],
    );
    const z = [...r.auto, ...r.navrhy][0];
    if (z) expect(z.suma).toBeLessThanOrEqual(4810);
  });

  it("dve rovnako sediace faktúry sa nespárujú automaticky", () => {
    const dvojicka: Doklad[] = [
      doklad({ id: "a", invoice_number: "2026038", variable_symbol: "2026038" }),
      doklad({ id: "b", invoice_number: "2026038", variable_symbol: "2026038" }),
    ];
    const r = sparuj([pohyb({ id: "t" })], dvojicka);
    expect(r.auto).toEqual([]);
    expect(r.navrhy[0].dovody.join(" ")).toContain("rozhodnite ručne");
  });

  it("poradie pohybov nerozhoduje o výsledku", () => {
    const a = sparuj(pohyby, doklady);
    const b = sparuj([...pohyby].reverse(), [...doklady].reverse());
    const kluc = (z: { transactionId: string; invoiceId: string }) =>
      `${z.transactionId}->${z.invoiceId}`;
    expect(a.auto.map(kluc).sort()).toEqual(b.auto.map(kluc).sort());
    expect(a.navrhy.map(kluc).sort()).toEqual(b.navrhy.map(kluc).sort());
  });
});
