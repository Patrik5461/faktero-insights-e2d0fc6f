import { describe, expect, it } from "vitest";
import { rezimDphPrijatej, rezimDphVystavenej, stavZauctovania } from "./udaje-pre-uctovnika";

describe("rezimDphVystavenej", () => {
  it("bežná tuzemská faktúra nemá žiadny režim", () => {
    expect(rezimDphVystavenej({ reverse_charge: false })).toEqual([]);
  });
  it("prenesenie podľa druhu", () => {
    expect(
      rezimDphVystavenej({ reverse_charge: true, reverse_charge_type: "domestic_69" }),
    ).toEqual(["Prenesenie daňovej povinnosti (PDP)"]);
    expect(rezimDphVystavenej({ reverse_charge: true })).toEqual([
      "Prenesenie daňovej povinnosti (PDP)",
    ]);
    expect(rezimDphVystavenej({ reverse_charge: true, reverse_charge_type: "export" })).toEqual([
      "Vývoz mimo EÚ (oslobodené)",
    ]);
    expect(
      rezimDphVystavenej({
        reverse_charge: true,
        reverse_charge_type: "eu_b2b",
        eu_plnenie: "sluzba",
      }),
    ).toEqual(["Služba do EÚ (prenesenie daňovej povinnosti)"]);
    expect(rezimDphVystavenej({ reverse_charge: true, reverse_charge_type: "eu_b2b" })).toEqual([
      "Dodanie tovaru do EÚ (oslobodené)",
    ]);
  });
  it("prenesenie len pri časti položiek, OSS a osobitná úprava", () => {
    expect(
      rezimDphVystavenej({ oss: true, oss_country: "AT", osobitna_uprava: "66_tovar" }, true),
    ).toEqual([
      "Prenesenie daňovej povinnosti pri časti položiek",
      "OSS (AT)",
      "Osobitná úprava — použitý tovar",
    ]);
    expect(rezimDphVystavenej({ osobitna_uprava: "xyz" })).toEqual(["Osobitná úprava"]);
  });
});

describe("rezimDphPrijatej", () => {
  it("tuzemská faktúra s odpočtom nemá režim", () => {
    expect(rezimDphPrijatej({ dph_rezim: "tuzemsko", odpocet: true, vat_amount: 23 })).toEqual([]);
    expect(rezimDphPrijatej({})).toEqual([]);
  });
  it("samozdanenie, nadobudnutie, dovoz, bez dane", () => {
    expect(rezimDphPrijatej({ dph_rezim: "samozdanenie" })).toEqual([
      "Prenesenie daňovej povinnosti (PDP)",
    ]);
    expect(rezimDphPrijatej({ reverse_charge: true })).toEqual([
      "Prenesenie daňovej povinnosti (PDP)",
    ]);
    expect(rezimDphPrijatej({ dph_rezim: "samozdanenie", eu_plnenie: "sluzba" })).toEqual([
      "Služba z EÚ (prenesenie daňovej povinnosti)",
    ]);
    expect(rezimDphPrijatej({ dph_rezim: "nadobudnutie" })).toEqual(["Nadobudnutie tovaru z EÚ"]);
    expect(rezimDphPrijatej({ dph_rezim: "dovoz" })).toEqual([
      "Dovoz — daň zaplatená colnému úradu",
    ]);
    expect(rezimDphPrijatej({ dph_rezim: "bez_dane" })).toEqual(["Bez dane / od neplatiteľa"]);
  });
  it("bez odpočtu sa ukáže len pri nenulovej DPH", () => {
    expect(rezimDphPrijatej({ odpocet: false, vat_amount: 10 })).toEqual(["Bez odpočtu DPH"]);
    expect(rezimDphPrijatej({ odpocet: false, vat_amount: 0 })).toEqual([]);
  });
});

describe("stavZauctovania", () => {
  it("nezaúčtovaná, zaúčtovaná, odovzdaná", () => {
    expect(stavZauctovania({})).toEqual({
      text: "Nezaúčtovaná",
      odovzdane: false,
      zamknute: false,
      kedy: null,
    });
    expect(stavZauctovania({ zauctovane_at: "2026-10-01T10:00:00Z" })).toMatchObject({
      text: "Zaúčtovaná",
      zamknute: false,
      kedy: "2026-10-01T10:00:00Z",
    });
    expect(stavZauctovania({ zauctovane_at: "x", locked_at: "y" })).toMatchObject({
      zamknute: true,
    });
    expect(stavZauctovania({ zauctovane_at: "x", exported_at: "2026-10-02" })).toEqual({
      text: "Odovzdaná do účtovníctva",
      odovzdane: true,
      zamknute: true,
      kedy: "2026-10-02",
    });
  });
});
