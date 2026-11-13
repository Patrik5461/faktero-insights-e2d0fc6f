import { describe, expect, it } from "vitest";
import {
  dphZoZakladu,
  skontrolujDphDokladu,
  hlaskaSpustacaDph,
  jeChybaSpustacaDph,
  rozpisPreKontrolu,
  skontrolujDph,
  toleranciaRiadku,
  zakonneSadzby,
} from "./dph-pravidlo";

describe("zakonneSadzby", () => {
  it("SK od 2025 a do 2024", () => {
    expect(zakonneSadzby("SK", "2025-01-01")).toEqual([0, 5, 19, 23]);
    expect(zakonneSadzby("SK", "2024-12-31")).toEqual([0, 10, 20]);
  });
  it("CZ od 2024 a predtým", () => {
    expect(zakonneSadzby("CZ", "2024-03-01")).toEqual([0, 12, 21]);
    expect(zakonneSadzby("CZ", "2023-06-30")).toEqual([0, 10, 15, 21]);
  });
  it("bez dňa všetko, čo platilo", () => {
    expect(zakonneSadzby("SK")).toEqual([0, 5, 10, 19, 20, 23]);
    expect(zakonneSadzby("SK", "nezmysel")).toEqual([0, 5, 10, 19, 20, 23]);
  });
});

describe("dphZoZakladu a tolerancia", () => {
  it("zaokrúhli na centy", () => {
    expect(dphZoZakladu(100, 23)).toBe(23);
    expect(dphZoZakladu(10.05, 23)).toBe(2.31);
    expect(dphZoZakladu(-50, 20)).toBe(-10);
  });
  it("tolerancia riadku", () => {
    expect(toleranciaRiadku()).toBe(0.02);
    expect(toleranciaRiadku(5)).toBe(0.05);
    expect(toleranciaRiadku(40)).toBe(0.1);
  });
});

const sk25 = { krajina: "SK" as const, den: "2026-10-15" };

describe("skontrolujDph", () => {
  it("správna jedna sadzba prejde", () => {
    expect(
      skontrolujDph({ ...sk25, rozpis: [{ sadzba: 23, zaklad: 100, dph: 23 }], zaklad: 100, dph: 23 }),
    ).toEqual([]);
  });

  it("Tempus-Car: DPH z plnej sumy pri základe po odpočte zálohy (30,5 %) bez rozpisu neprejde", () => {
    // Základ znížený o nezdanenú zálohu, DPH z plnej sumy.
    const chyby = skontrolujDph({ ...sk25, rozpis: null, zaklad: 1000, dph: 305 });
    expect(chyby).toHaveLength(1);
    expect(chyby[0].kod).toBe("chyba_rozpis");
    expect(chyby[0].text).toContain("30,5 %");
  });

  it("Tempus-Car: ani s rozpisom 23 % nesedí DPH riadku", () => {
    const chyby = skontrolujDph({
      ...sk25,
      rozpis: [{ sadzba: 23, zaklad: 1000, dph: 305 }],
      zaklad: 1000,
      dph: 305,
    });
    expect(chyby.map((c) => c.kod)).toEqual(["dph"]);
  });

  it("Tempus-Car opravené: 23 % z plnej sumy, záloha mimo rozpisu", () => {
    expect(
      skontrolujDph({ ...sk25, rozpis: [{ sadzba: 23, zaklad: 1326.09, dph: 305 }], zaklad: 1326.09, dph: 305 }),
    ).toEqual([]);
  });

  it("zmiešané 5 % + 23 % s rozpisom prejde, bez rozpisu nie", () => {
    const rozpis = [
      { sadzba: 5, zaklad: 200, dph: 10 },
      { sadzba: 23, zaklad: 100, dph: 23 },
    ];
    expect(skontrolujDph({ ...sk25, rozpis, zaklad: 300, dph: 33 })).toEqual([]);
    const bez = skontrolujDph({ ...sk25, rozpis: [], zaklad: 300, dph: 33 });
    expect(bez.map((c) => c.kod)).toEqual(["chyba_rozpis"]);
  });

  it("nezákonná sadzba v rozpise", () => {
    const chyby = skontrolujDph({
      ...sk25,
      rozpis: [{ sadzba: 13, zaklad: 100, dph: 13 }],
      zaklad: 100,
      dph: 13,
    });
    expect(chyby.map((c) => c.kod)).toEqual(["sadzba"]);
  });

  it("súčet rozpisu nesedí s hlavičkou", () => {
    const chyby = skontrolujDph({
      ...sk25,
      rozpis: [{ sadzba: 23, zaklad: 100, dph: 23 }],
      zaklad: 150,
      dph: 23,
    });
    expect(chyby.map((c) => c.kod)).toEqual(["hlavicka"]);
  });

  it("prenesenie: daň 0, sadzba smie byť zákonná", () => {
    expect(
      skontrolujDph({
        ...sk25,
        rozpis: [{ sadzba: 23, zaklad: 500, dph: 0, vat_category: "reverse_charge" }],
        zaklad: 500,
        dph: 0,
      }),
    ).toEqual([]);
    expect(
      skontrolujDph({ ...sk25, rozpis: [{ sadzba: 0, zaklad: 500, dph: 0, pdp: true }], zaklad: 500, dph: 0 }),
    ).toEqual([]);
    const s = skontrolujDph({
      ...sk25,
      rozpis: [{ sadzba: 23, zaklad: 500, dph: 115, pdp: true }],
      zaklad: 500,
      dph: 115,
    });
    expect(s.map((c) => c.kod)).toEqual(["dph"]);
  });

  it("záporný riadok zdanenej zálohy v tej istej sadzbe", () => {
    expect(
      skontrolujDph({
        ...sk25,
        rozpis: [
          { sadzba: 23, zaklad: 1000, dph: 230 },
          { sadzba: 23, zaklad: -400, dph: -92 },
        ],
        zaklad: 600,
        dph: 138,
      }),
    ).toEqual([]);
  });

  it("záporný riadok zálohy z roku 2024 smie mať 20 % aj na faktúre z 2025", () => {
    expect(
      skontrolujDph({
        ...sk25,
        rozpis: [
          { sadzba: 23, zaklad: 1000, dph: 230 },
          { sadzba: 20, zaklad: -400, dph: -80 },
        ],
        zaklad: 600,
        dph: 150,
      }),
    ).toEqual([]);
  });

  it("staré sadzby 20/10 pred 2025 platia, po 2025 nie", () => {
    const rozpis = [
      { sadzba: 20, zaklad: 100, dph: 20 },
      { sadzba: 10, zaklad: 50, dph: 5 },
    ];
    expect(skontrolujDph({ krajina: "SK", den: "2024-11-30", rozpis, zaklad: 150, dph: 25 })).toEqual([]);
    expect(
      skontrolujDph({ krajina: "SK", den: "2025-02-01", rozpis, zaklad: 150, dph: 25 }).map((c) => c.kod),
    ).toEqual(["sadzba", "sadzba"]);
    // 23 % ešte v roku 2024 neplatila
    expect(
      skontrolujDph({ krajina: "SK", den: "2024-06-01", rozpis: null, zaklad: 100, dph: 23 }).map(
        (c) => c.kod,
      ),
    ).toEqual(["chyba_rozpis"]);
    expect(skontrolujDph({ krajina: "SK", den: "2024-06-01", rozpis: null, zaklad: 100, dph: 20 })).toEqual(
      [],
    );
  });

  it("CZ: 21/12 od 2024, 15 % len predtým", () => {
    expect(
      skontrolujDph({
        krajina: "CZ",
        den: "2025-05-05",
        rozpis: [
          { sadzba: 21, zaklad: 1000, dph: 210 },
          { sadzba: 12, zaklad: 100, dph: 12 },
        ],
        zaklad: 1100,
        dph: 222,
      }),
    ).toEqual([]);
    expect(
      skontrolujDph({
        krajina: "CZ",
        den: "2025-05-05",
        rozpis: [{ sadzba: 23, zaklad: 100, dph: 23 }],
        zaklad: 100,
        dph: 23,
      }).map((c) => c.kod),
    ).toEqual(["sadzba"]);
    expect(
      skontrolujDph({
        krajina: "CZ",
        den: "2023-05-05",
        rozpis: [{ sadzba: 15, zaklad: 100, dph: 15 }],
        zaklad: 100,
        dph: 15,
      }),
    ).toEqual([]);
  });

  it("hlavička bez rozpisu: pomer v tolerancii 0,3 p. b. a centové zaokrúhlenie", () => {
    expect(skontrolujDph({ ...sk25, rozpis: null, zaklad: 99.99, dph: 23 })).toEqual([]);
    // 0,10 × 23 % = 0,02 (20 %) — rozdiel len v centoch
    expect(skontrolujDph({ ...sk25, rozpis: null, zaklad: 0.1, dph: 0.02 })).toEqual([]);
    // O2 20,54 %
    expect(skontrolujDph({ ...sk25, rozpis: null, zaklad: 100, dph: 20.54 })).toHaveLength(1);
    expect(skontrolujDph({ ...sk25, rozpis: null, zaklad: 100, dph: 0 })).toEqual([]);
    expect(skontrolujDph({ ...sk25, rozpis: null, zaklad: 0, dph: 5 }).map((c) => c.kod)).toEqual([
      "chyba_rozpis",
    ]);
  });

  it("dobropis (záporné sumy)", () => {
    expect(
      skontrolujDph({ ...sk25, rozpis: [{ sadzba: 23, zaklad: -100, dph: -23 }], zaklad: -100, dph: -23 }),
    ).toEqual([]);
    expect(skontrolujDph({ ...sk25, rozpis: null, zaklad: -100, dph: -23 })).toEqual([]);
  });

  it("zaokrúhlenie po položkách: viac položiek, väčšia tolerancia", () => {
    const v = { ...sk25, rozpis: [{ sadzba: 23, zaklad: 100, dph: 23.04 }], zaklad: 100, dph: 23.04 };
    expect(skontrolujDph(v).map((c) => c.kod)).toEqual(["dph"]);
    expect(skontrolujDph({ ...v, poloziek: 5 })).toEqual([]);
  });

  it("zahraničný dodávateľ: sadzby jeho štátu", () => {
    const at = { ...sk25, rozpis: [{ sadzba: 13, zaklad: 100, dph: 13 }], zaklad: 100, dph: 13 };
    expect(skontrolujDph(at).map((c) => c.kod)).toEqual(["sadzba"]);
    expect(skontrolujDph({ ...at, krajinaDodavatela: "AT" })).toEqual([]);
    expect(skontrolujDph({ ...at, krajinaDodavatela: "HU" }).map((c) => c.kod)).toEqual(["sadzba"]);
    expect(skontrolujDph({ ...at, krajinaDodavatela: "SK" }).map((c) => c.kod)).toEqual(["sadzba"]);
  });
});

describe("pomocníci", () => {
  it("rozpisPreKontrolu prijme aj anglické kľúče", () => {
    expect(rozpisPreKontrolu([{ rate: "23", base: "10,00", vat: 2.3 }])).toEqual([
      { sadzba: 23, zaklad: 10, dph: 2.3, vat_category: null, pdp: false },
    ]);
    expect(rozpisPreKontrolu(null)).toBeNull();
  });
  it("chyba spúšťača", () => {
    const e = { message: "FAKTERO_DPH: Sadzba 13 % nie je zákonná.", code: "P0001" };
    expect(jeChybaSpustacaDph(e)).toBe(true);
    expect(hlaskaSpustacaDph(e)).toBe("Sadzba 13 % nie je zákonná.");
    expect(hlaskaSpustacaDph(new Error("iné"))).toBeNull();
  });
});

describe("skontrolujDphDokladu (ako spúšťač)", () => {
  const zla = {
    type: "regular",
    status: "received",
    amount_without_vat: 1000,
    vat_amount: 305,
    delivery_date: "2026-10-01",
  };
  it("nový zlý doklad neprejde, koncept a záloha áno", () => {
    expect(skontrolujDphDokladu("purchase_invoices", zla, "SK")).toHaveLength(1);
    expect(skontrolujDphDokladu("purchase_invoices", { ...zla, status: "draft" }, "SK")).toEqual([]);
    expect(skontrolujDphDokladu("purchase_invoices", { ...zla, type: "proforma" }, "SK")).toEqual([]);
    expect(skontrolujDphDokladu("purchase_invoices", { ...zla, samofakturacia: true }, "SK")).toEqual([]);
  });
  it("úprava iných stĺpcov starého zlého dokladu prejde, zmena sumy nie", () => {
    expect(skontrolujDphDokladu("purchase_invoices", { status: "booked" }, "SK", zla)).toEqual([]);
    expect(skontrolujDphDokladu("purchase_invoices", { vat_amount: 305 }, "SK", zla)).toEqual([]);
    expect(skontrolujDphDokladu("purchase_invoices", { vat_amount: 306 }, "SK", zla)).toHaveLength(1);
  });
  it("koncept → prijatá sa kontroluje", () => {
    expect(
      skontrolujDphDokladu("purchase_invoices", { status: "received" }, "SK", { ...zla, status: "draft" }),
    ).toHaveLength(1);
  });
  it("bloček: net_amount a issue_date, česká firma", () => {
    expect(
      skontrolujDphDokladu("expense_documents", { net_amount: 100, vat_amount: 21, issue_date: "2026-01-01" }, "CZ"),
    ).toEqual([]);
    expect(
      skontrolujDphDokladu("expense_documents", { net_amount: 100, vat_amount: 23, issue_date: "2026-01-01" }, "CZ"),
    ).toHaveLength(1);
  });
});
