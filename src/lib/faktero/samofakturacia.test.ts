import { describe, expect, it } from "vitest";
import {
  VETA_SAMOFAKTURACIA,
  chybaDohody,
  dohodaPlati,
  dodavatelPlatitel,
  prepocitajPolozku,
  stavSamofaktury,
  sumySamofaktury,
  zapocitatelna,
} from "./samofakturacia";
import { vetyNaDoklad } from "./faktura-nalezitosti";

describe("samofakturácia", () => {
  it("dohoda musí byť uzavretá vopred a platiť v deň vyhotovenia", () => {
    const k = { samofakturacia_od: "2026-10-01", samofakturacia_do: "2026-12-31" };
    expect(dohodaPlati(k, "2026-10-01")).toBe(true);
    expect(dohodaPlati(k, "2026-09-30")).toBe(false);
    expect(dohodaPlati(k, "2027-01-01")).toBe(false);
    expect(dohodaPlati({ samofakturacia_od: "2026-10-01" }, "2030-01-01")).toBe(true);
    expect(dohodaPlati(null, "2026-10-05")).toBe(false);
    expect(chybaDohody(null, "2026-10-05")).toMatch(/nemáte zapísanú dohodu/);
    expect(chybaDohody(k, "2026-09-30")).toMatch(/platí až od 1\. 10\. 2026/);
    expect(chybaDohody(k, "2027-01-02")).toMatch(/skončila 31\. 12\. 2026/);
    expect(chybaDohody(k, "2026-11-11")).toBeNull();
  });

  it("neplatiteľ fakturuje bez dane, platiteľ podľa sadzieb", () => {
    expect(dodavatelPlatitel("SK2020000000")).toBe(true);
    expect(dodavatelPlatitel("  ")).toBe(false);
    const p = { name: "Drevo", quantity: 3, unit_price: 10.005, vat_rate: 23 };
    expect(prepocitajPolozku(p, false)).toMatchObject({ vat_rate: 0, total: 30.02 });
    expect(prepocitajPolozku(p, true).vat_rate).toBe(23);
  });

  it("daň sa počíta zo súčtu za sadzbu", () => {
    const s = sumySamofaktury([
      prepocitajPolozku({ name: "a", quantity: 1, unit_price: 0.05, vat_rate: 23 }, true),
      prepocitajPolozku({ name: "b", quantity: 1, unit_price: 0.05, vat_rate: 23 }, true),
      prepocitajPolozku({ name: "c", quantity: 2, unit_price: 50, vat_rate: 5 }, true),
    ]);
    expect(s.sadzby).toEqual([
      { sadzba: 23, zaklad: 0.1, dan: 0.02 },
      { sadzba: 5, zaklad: 100, dan: 5 },
    ]);
    expect(s).toMatchObject({ zaklad: 100.1, dan: 5.02, spolu: 105.12 });
  });

  it("do DPH a na úhradu ide až odsúhlasená", () => {
    expect(zapocitatelna({ samofakturacia: false })).toBe(true);
    expect(zapocitatelna({ samofakturacia: true, samofakturacia_stav: "caka" })).toBe(false);
    expect(zapocitatelna({ samofakturacia: true, samofakturacia_stav: null })).toBe(false);
    expect(zapocitatelna({ samofakturacia: true, samofakturacia_stav: "odsuhlasena" })).toBe(true);
    expect(stavSamofaktury({ samofakturacia_stav: null })).toBe("koncept");
    expect(stavSamofaktury({ samofakturacia_stav: "zamietnuta" })).toBe("zamietnuta");
  });

  it("na doklade je veta o vyhotovení odberateľom", () => {
    expect(vetyNaDoklad({ samofakturacia: true })).toEqual([VETA_SAMOFAKTURACIA]);
    expect(vetyNaDoklad({ samofakturacia: true, danZPrijatejPlatby: true })).toHaveLength(2);
    expect(vetyNaDoklad({})).toEqual([]);
  });
});
