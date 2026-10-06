import { describe, expect, it } from "vitest";
import { cast, den53b, narok25a, opravy53b, type PrijataNaKontrolu, type VystavenaNaKontrolu } from "./dph-nezaplatene";

const prijata: PrijataNaKontrolu = {
  cislo: "FA-1",
  dodavatelIcDph: "SK2020000000",
  rezim: "tuzemsko",
  odpocet: true,
  dobropis: false,
  splatnost: "2026-06-30",
  zaplatenaDna: null,
  zaplatena: false,
  riadky: [{ sadzba: 23, zaklad: 100, dan: 23 }],
};

describe("§ 53b — odberateľ", () => {
  it("101. deň po splatnosti", () => {
    expect(den53b("2026-06-30")).toBe("2026-10-09");
    expect(den53b("2026-01-20")).toBe("2026-05-01");
  });

  it("nezaplatená: vrátenie odpočtu v období 101. dňa", () => {
    const o = opravy53b([prijata], "2026-10-01", "2026-10-31");
    expect(o).toEqual([
      {
        cislo: "FA-1",
        dodavatelIcDph: "SK2020000000",
        druh: "vratenie",
        den: "2026-10-09",
        riadky: [{ sadzba: 23, zaklad: -100, dan: -23 }],
      },
    ]);
    expect(opravy53b([prijata], "2026-09-01", "2026-09-30")).toEqual([]);
  });

  it("zaplatená pred 101. dňom → nič; po ňom → opätovný odpočet v období úhrady", () => {
    expect(opravy53b([{ ...prijata, zaplatena: true, zaplatenaDna: "2026-10-08" }], "2026-10-01", "2026-10-31")).toEqual([]);
    const neskoro = { ...prijata, zaplatena: true, zaplatenaDna: "2026-12-03" };
    expect(opravy53b([neskoro], "2026-10-01", "2026-10-31")[0].druh).toBe("vratenie");
    const dec = opravy53b([neskoro], "2026-12-01", "2026-12-31");
    expect(dec).toEqual([expect.objectContaining({ druh: "opatovny_odpocet", riadky: [{ sadzba: 23, zaklad: 100, dan: 23 }] })]);
    // Zaplatená bez dátumu sa berie ako načas.
    expect(opravy53b([{ ...prijata, zaplatena: true }], "2026-10-01", "2026-10-31")).toEqual([]);
  });

  it("prenesenie, bez odpočtu, dobropis a § 68d sa vynechajú", () => {
    for (const z of [{ rezim: "samozdanenie" as const }, { odpocet: false }, { dobropis: true }]) {
      expect(opravy53b([{ ...prijata, ...z }], "2026-10-01", "2026-10-31")).toEqual([]);
    }
    expect(opravy53b([prijata], "2026-10-01", "2026-10-31", true)).toEqual([]);
  });
});

const vystavena: VystavenaNaKontrolu = {
  typ: "regular",
  stav: "sent",
  splatnost: "2026-01-15",
  datumDodania: "2026-01-01",
  spoluSDph: 615,
  zaplatene: 0,
  prenosDane: false,
  oss: false,
  dph: 115,
  uzOpravena: false,
  upomienok: 1,
};
const firma = { platitel: true, dph68d: false };

describe("§ 25a — dodávateľ", () => {
  it("nárok vzniká 150 dní po splatnosti", () => {
    expect(narok25a(vystavena, "2026-06-14", firma)).toMatchObject({ narok: false, od: "2026-06-15" });
    expect(narok25a(vystavena, "2026-06-15", firma)).toMatchObject({
      narok: true,
      trebaPotvrditZalobu: false,
      nezaplatene: 615,
    });
  });

  it("do 1 000 € chce upomienku, nad 1 000 € žalobu alebo exekúciu", () => {
    expect(narok25a({ ...vystavena, upomienok: 0 }, "2026-07-01", firma)).toMatchObject({
      narok: false,
      dovod: expect.stringMatching(/upomienku/),
    });
    expect(narok25a({ ...vystavena, spoluSDph: 1230, dph: 230, upomienok: 0 }, "2026-07-01", firma)).toMatchObject({
      narok: true,
      trebaPotvrditZalobu: true,
    });
  });

  it("čiastočná úhrada → len nezaplatená časť", () => {
    const r = narok25a({ ...vystavena, zaplatene: 215 }, "2026-07-01", firma);
    expect(r).toMatchObject({ narok: true, nezaplatene: 400 });
    if (r.narok) expect(cast([{ sadzba: 23, zaklad: 500, dan: 115 }], r.podiel)).toEqual([{ sadzba: 23, zaklad: 325.2, dan: 74.8 }]);
  });

  it("vylúčené prípady", () => {
    expect(narok25a({ ...vystavena, prenosDane: true }, "2026-07-01", firma).narok).toBe(false);
    expect(narok25a({ ...vystavena, uzOpravena: true }, "2026-07-01", firma).narok).toBe(false);
    expect(narok25a({ ...vystavena, zaplatene: 615 }, "2026-07-01", firma).narok).toBe(false);
    expect(narok25a(vystavena, "2026-07-01", { platitel: true, dph68d: true }).narok).toBe(false);
    expect(narok25a(vystavena, "2029-03-01", firma)).toMatchObject({ narok: false, dovod: expect.stringMatching(/3-ročná/) });
  });
});
