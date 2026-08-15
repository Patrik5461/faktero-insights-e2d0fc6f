import { describe, expect, it } from "vitest";
import { anuita, datumSplatky, kalendar, suhrn, zaokruhli } from "./financovanie";

/**
 * Splátkový kalendár.
 *
 * Testuje sa to, čo by v účtovníctve narobilo škodu: že súčet istín sedí s
 * financovanou sumou na cent, že sa dátumy nepreklopia do zlého mesiaca a že
 * zostatková cena dobehne na konci, nie priebežne.
 */

describe("anuita", () => {
  it("bezúročné splátky sa delia rovným dielom", () => {
    expect(anuita(1200, 0, 12)).toBe(100);
  });

  it("sedí so známym príkladom", () => {
    // 10 000 € na 5 rokov pri 5 % p. a. → 188,71 € mesačne.
    expect(anuita(10000, 5, 60)).toBe(188.71);
  });

  it("nula mesiacov nespadne", () => {
    expect(anuita(1000, 5, 0)).toBe(0);
  });
});

describe("dátumy splátok", () => {
  it("ide po mesiacoch a prechádza cez rok", () => {
    expect(datumSplatky("2026-11-15", 0)).toBe("2026-11-15");
    expect(datumSplatky("2026-11-15", 2)).toBe("2027-01-15");
  });

  it("31. deň sa v kratšom mesiaci stiahne na koniec, nie do ďalšieho", () => {
    // Toto je klasická pasca: `new Date(2026, 10, 31)` by ticho vyrobilo
    // 1. december a celý kalendár by sa posunul.
    expect(datumSplatky("2026-10-31", 1)).toBe("2026-11-30");
    expect(datumSplatky("2026-12-31", 2)).toBe("2027-02-28");
  });

  it("prestupný rok pozná", () => {
    expect(datumSplatky("2028-01-31", 1)).toBe("2028-02-29");
  });
});

describe("kalendár", () => {
  const uver = {
    principal: 10000,
    interest_rate: 5,
    term_months: 60,
    first_due_date: "2026-09-15",
  };

  it("má toľko riadkov, koľko je mesiacov", () => {
    expect(kalendar(uver)).toHaveLength(60);
  });

  it("súčet istín sedí s financovanou sumou na cent", () => {
    // Najdôležitejší test celého súboru. Keby sa riadky počítali nezávisle,
    // rozdiel pár centov by v účtovníctve visel navždy.
    const istiny = kalendar(uver).reduce((s, r) => s + r.principal_part, 0);
    expect(zaokruhli(istiny)).toBe(10000);
  });

  it("úrok na začiatku prevažuje, na konci mizne", () => {
    const r = kalendar(uver);
    expect(r[0].interest_part).toBeGreaterThan(r[59].interest_part);
    expect(r[0].principal_part).toBeLessThan(r[59].principal_part);
  });

  it("zostatok istiny klesá až na nulu", () => {
    const r = kalendar(uver);
    expect(r[0].remaining_principal).toBeLessThan(10000);
    expect(r[59].remaining_principal).toBe(0);
  });

  it("bez úroku je splátka celá istina", () => {
    const r = kalendar({ ...uver, interest_rate: 0, term_months: 10, principal: 1000 });
    expect(r[0].amount).toBe(100);
    expect(r[0].principal_part).toBe(100);
    expect(r[0].interest_part).toBe(0);
    expect(zaokruhli(r.reduce((s, x) => s + x.principal_part, 0))).toBe(1000);
  });

  it("DPH sa počíta zo splátky ako z ceny s daňou", () => {
    const r = kalendar({
      ...uver,
      vat_rate: 23,
      term_months: 12,
      principal: 1200,
      interest_rate: 0,
    });
    // Splátka 100 € s DPH → základ 81,30, daň 18,70.
    expect(r[0].amount).toBe(100);
    expect(r[0].vat_amount).toBe(18.7);
  });

  it("bez sadzby DPH je daň nula", () => {
    expect(kalendar(uver)[0].vat_amount).toBe(0);
  });

  it("zostatková cena dobehne na konci, nie priebežne", () => {
    const r = kalendar({
      principal: 12000,
      interest_rate: 0,
      term_months: 12,
      first_due_date: "2026-09-01",
      residual_value: 2400,
    });
    // Spláca sa 9 600 v dvanástich splátkach po 800; posledná berie navyše
    // zostatkovú cenu.
    expect(r[0].amount).toBe(800);
    expect(r[11].principal_part).toBe(2400 + 800);
    expect(zaokruhli(r.reduce((s, x) => s + x.principal_part, 0))).toBe(12000);
  });

  it("pevná splátka zo zmluvy má prednosť pred výpočtom", () => {
    const r = kalendar({
      ...uver,
      payment_amount: 200,
      term_months: 12,
      principal: 2400,
      interest_rate: 0,
    });
    expect(r[0].amount).toBe(200);
  });

  it("jedna splátka zaplatí všetko", () => {
    const r = kalendar({ ...uver, term_months: 1, principal: 500, interest_rate: 0 });
    expect(r).toHaveLength(1);
    expect(r[0].principal_part).toBe(500);
    expect(r[0].remaining_principal).toBe(0);
  });
});

describe("súhrn", () => {
  it("povie, koľko sa zaplatí navyše", () => {
    const z = { principal: 10000, interest_rate: 5, term_months: 60, first_due_date: "2026-09-15" };
    const s = suhrn(kalendar(z), z);
    expect(s.splatok).toBe(60);
    expect(s.zaplatiSpolu).toBeGreaterThan(10000);
    // Pri 5 % na päť rokov je preplatok okolo 1 320 €.
    expect(s.prepatok).toBeGreaterThan(1200);
    expect(s.prepatok).toBeLessThan(1450);
  });

  it("bezúročné financovanie nemá preplatok", () => {
    const z = { principal: 1200, interest_rate: 0, term_months: 12, first_due_date: "2026-09-15" };
    expect(suhrn(kalendar(z), z).prepatok).toBe(0);
  });
});

describe("skutočná zmluva ČSOB Leasing UZF/26/80359", () => {
  /*
    Toto nie je vymyslený príklad — je to prvá skutočná zmluva, ktorú do Faktera
    niekto zapísal, a práve na nej sa ukázalo, že úrok treba počítať zo
    skutočných dní. Preto je tu celý jej úrokový stĺpec: keby sa výpočet niekedy
    zmenil, tento test to zachytí skôr než zákazník.
  */
  const ZMLUVA = {
    principal: 18699.81,
    interest_rate: 6.2968,
    term_months: 36,
    first_due_date: "2026-06-18",
    interest_from: "2026-05-19",
    payment_amount: 571.43,
    day_count: "ACT/365" as const,
  };

  const UROK_ZO_ZMLUVY = [
    96.78, 94.33, 94.92, 92.37, 86.91, 87.22, 81.9, 82.01, 79.39, 69.33, 74.07, 69.11, 68.73, 63.91,
    63.33, 60.61, 56.01, 55.12, 50.67, 49.57, 46.78, 41.14, 41.14, 37.07, 35.45, 31.53, 29.69, 26.8,
    23.11, 20.95, 17.43, 15.04, 12.07, 8.2, 6.06, 2.92,
  ];

  it("úrok sedí so zmluvou riadok po riadku (do troch centov)", () => {
    /*
      Sadzba 6,2968 % je spätne odvodená z prvého riadku — v zmluve uvedená nie
      je. Banka si navyše každý riadok zaokrúhľuje sama, takže zopár centov
      rozdielu je fyzikálne nevyhnutných. Podstatné je, že to už nie sú eurá.
    */
    const r = kalendar(ZMLUVA);
    for (let i = 0; i < 36; i++) {
      expect(Math.abs(r[i].interest_part - UROK_ZO_ZMLUVY[i])).toBeLessThanOrEqual(0.03);
    }
  });

  it("úrok neklesá plynulo — kopíruje dĺžku mesiaca", () => {
    // Práve toto pôvodný výpočet nevedel: február má menej dní, tak má menej
    // úroku než mesiace okolo neho.
    const r = kalendar(ZMLUVA);
    expect(r[2].interest_part).toBeGreaterThan(r[1].interest_part);
    expect(r[9].interest_part).toBeLessThan(r[8].interest_part);
    expect(r[10].interest_part).toBeGreaterThan(r[9].interest_part);
  });

  it("celkový úrok aj posledná splátka sedia", () => {
    const r = kalendar(ZMLUVA);
    const spolu = r.reduce((s, x) => s + x.interest_part, 0);
    expect(Math.abs(spolu - 1871.67)).toBeLessThan(0.5);
    expect(Math.abs(r[35].amount - 571.43)).toBeLessThan(0.5);
    expect(zaokruhli(r.reduce((s, x) => s + x.principal_part, 0))).toBe(18699.81);
  });

  it("starý spôsob (30E/360) by sa rozišiel o vyše eura", () => {
    // Dôkaz, že to nie je kozmetika: rovnaká zmluva počítaná dvanástinami roka.
    const stary = kalendar({ ...ZMLUVA, day_count: "30E/360" });
    const spolu = stary.reduce((s, x) => s + x.interest_part, 0);
    expect(Math.abs(spolu - 1871.67)).toBeGreaterThan(1);
  });
});
