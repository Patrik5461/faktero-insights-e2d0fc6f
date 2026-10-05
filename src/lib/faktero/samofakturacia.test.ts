import { describe, expect, it } from "vitest";
import {
  VETA_SAMOFAKTURACIA,
  chybaDohody,
  dohodaPlati,
  dodavatelPlatitel,
  prepocitajPolozku,
  rezimDphSamofaktury,
  stavSamofaktury,
  sumyNaZapis,
  zlavaDokladuSuma,
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

  it("zľava na riadku je v jeho sume, popis ostáva", () => {
    const p = prepocitajPolozku(
      { name: "Kov", description: "DL 15/2026", quantity: 4, unit_price: 25, discount_percent: 10, vat_rate: 23 },
      true,
    );
    expect(p).toMatchObject({ total: 90, discount_percent: 10, description: "DL 15/2026" });
    expect(prepocitajPolozku({ name: "x", quantity: 1, unit_price: 10, discount_percent: 150 }, true).total).toBe(0);
  });

  it("prenesenie: daň samozdaníme, dodávateľovi len základ", () => {
    expect(rezimDphSamofaktury({ reverse_charge: true, reverse_charge_type: "domestic_69" }, true)).toBe(
      "samozdanenie",
    );
    expect(
      rezimDphSamofaktury({ reverse_charge: true, reverse_charge_type: "eu_b2b", eu_plnenie: "tovar" }, true),
    ).toBe("nadobudnutie");
    expect(
      rezimDphSamofaktury({ reverse_charge: true, reverse_charge_type: "eu_b2b", eu_plnenie: "sluzba" }, true),
    ).toBe("samozdanenie");
    expect(rezimDphSamofaktury({}, true)).toBeNull();
    expect(rezimDphSamofaktury({}, false)).toBe("bez_dane");
    const sumy = sumySamofaktury([prepocitajPolozku({ name: "Šrot", quantity: 1, unit_price: 100, vat_rate: 23 }, true)]);
    expect(sumyNaZapis(sumy, true)).toEqual({ amount_without_vat: 100, vat_amount: 23, amount_total: 100 });
    expect(sumyNaZapis(sumy, false).amount_total).toBe(123);
  });

  it("zľava na doklad sa rozpočíta na sadzby a daň ide zo zľavneného základu", () => {
    const pol = [
      prepocitajPolozku({ name: "a", quantity: 1, unit_price: 100, vat_rate: 23 }, true),
      prepocitajPolozku({ name: "b", quantity: 1, unit_price: 50, vat_rate: 5 }, true),
    ];
    expect(zlavaDokladuSuma(pol, "percent", 10)).toBe(15);
    expect(zlavaDokladuSuma(pol, "amount", 500)).toBe(150);
    expect(zlavaDokladuSuma(pol, null, 10)).toBe(0);
    const s = sumySamofaktury(pol, 15);
    expect(s.sadzby).toEqual([
      { sadzba: 23, zaklad: 90, dan: 20.7 },
      { sadzba: 5, zaklad: 45, dan: 2.25 },
    ]);
    expect(s).toMatchObject({ zaklad: 135, dan: 22.95, spolu: 157.95, zlava: 15 });
    // Zľava 1/3 — halier dorovná posledná sadzba, súčet sedí presne.
    const t = sumySamofaktury(pol, 50);
    expect(t.zaklad).toBe(100);
  });
});
