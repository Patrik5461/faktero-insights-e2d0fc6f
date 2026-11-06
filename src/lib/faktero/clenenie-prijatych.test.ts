import { describe, expect, it } from "vitest";
import { resolveVatClassificationPrijatej, zmenaClenePrijatych } from "./clenenie-prijatych";
import { systemoveRiadky } from "./predkontacie-systemove";

const ciselnik = systemoveRiadky()
  .filter((r) => r.druh === "clenenie_dph")
  .map((r) => ({ druh: r.druh, kod: r.kod, popis: r.popis, agenda: r.agenda, aktivne: true }));
const kvCiselnik = systemoveRiadky()
  .filter((r) => r.druh === "kv_clenenie" && r.typ_dokladu !== "vydane")
  .map((r) => r.kod);
const SK = { country: "SK", vat_payer: true, ic_dph: "SK2020000000" };
const ctx = { ciselnik, kvCiselnik };

describe("predvyplnenie členenia prijatých dokladov", () => {
  it("tuzemská prijatá faktúra s DPH → PD a B2", () => {
    const v = resolveVatClassificationPrijatej(SK, "prijata", { amount_total: 123, vat_amount: 23 }, ctx);
    expect(v.pohoda_clenenie_dph).toBe("PD");
    expect(v.kv_clenenie).toBe("B2");
    expect(v.zdroj).toEqual({ clenenie: "system", kv: "system" });
  });

  it("bloček s DPH → PD a B3", () => {
    const v = resolveVatClassificationPrijatej(SK, "blocek", { total_amount: 12.3, vat_amount: 2.3 }, ctx);
    expect(v.pohoda_clenenie_dph).toBe("PD");
    expect(v.kv_clenenie).toBe("B3");
  });

  it("prenesenie daňovej povinnosti → kód z číselníka a B1", () => {
    const v = resolveVatClassificationPrijatej(
      SK,
      "prijata",
      { amount_total: 100, vat_amount: 0, reverse_charge: true, dph_rezim: "samozdanenie", supplier_country: "SK" },
      ctx,
    );
    expect(v.pohoda_clenenie_dph).toBe("PDsluz");
    expect(v.kv_clenenie).toBe("B1");
  });

  it("predvolené firmy prebije systém pri bežnom doklade, pravidlo prebije oboje", () => {
    const firma = { ...SK, pohoda_clenenie_dph_prijata: "PK", kv_clenenie_prijata: "B3" };
    const v = resolveVatClassificationPrijatej(firma, "prijata", { amount_total: 123, vat_amount: 23 }, ctx);
    expect([v.pohoda_clenenie_dph, v.zdroj.clenenie]).toEqual(["PK", "firma"]);
    expect([v.kv_clenenie, v.zdroj.kv]).toEqual(["B3", "firma"]);
    const p = resolveVatClassificationPrijatej(
      firma,
      "prijata",
      { amount_total: 123, vat_amount: 23 },
      { ...ctx, pravidlo: { clenenie_dph: "PB", kv_clenenie: "KN" } },
    );
    expect([p.pohoda_clenenie_dph, p.kv_clenenie]).toEqual(["PB", "KN"]);
  });

  it("ručná zmena má prednosť a automatika ju nezmení", () => {
    const row = { amount_total: 123, vat_amount: 23, pohoda_clenenie_dph: "PK", clenenie_zdroj: null, kv_clenenie: "B3", kv_zdroj: "rucne" };
    const v = resolveVatClassificationPrijatej(SK, "prijata", row, ctx);
    expect([v.pohoda_clenenie_dph, v.kv_clenenie]).toEqual(["PK", "B3"]);
    expect(v.rucne).toEqual({ clenenie: true, kv: true });
    expect(zmenaClenePrijatych(row, v, { lenDoplnit: false })).toEqual({ clenenie_zdroj: "rucne" });
  });

  it("automatická hodnota sa po zmene údajov prepočíta", () => {
    const row = { amount_total: 100, vat_amount: 0, reverse_charge: true, dph_rezim: "samozdanenie", pohoda_clenenie_dph: "PD", clenenie_zdroj: "auto", kv_clenenie: "B2", kv_zdroj: "auto" };
    const v = resolveVatClassificationPrijatej(SK, "prijata", row, ctx);
    expect(zmenaClenePrijatych(row, v, { lenDoplnit: false })).toEqual({ pohoda_clenenie_dph: "PDsluz", kv_clenenie: "B1" });
    // Zaúčtovaný doklad: vyplnené ostáva.
    expect(zmenaClenePrijatych(row, v, { lenDoplnit: true })).toEqual({});
  });

  it("prázdny doklad dostane hodnoty a zdroj auto", () => {
    const row = { amount_total: 123, vat_amount: 23 };
    const v = resolveVatClassificationPrijatej(SK, "prijata", row, ctx);
    expect(zmenaClenePrijatych(row, v, { lenDoplnit: false })).toEqual({
      pohoda_clenenie_dph: "PD",
      clenenie_zdroj: "auto",
      kv_clenenie: "B2",
      kv_zdroj: "auto",
    });
  });

  it("neplatiteľ, zálohová faktúra a česká firma", () => {
    const n = resolveVatClassificationPrijatej({ country: "SK", vat_payer: false }, "prijata", { amount_total: 123, vat_amount: 23 }, ctx);
    expect([n.pohoda_clenenie_dph, n.kv_clenenie]).toEqual([null, null]);
    const z = resolveVatClassificationPrijatej(SK, "prijata", { type: "proforma", amount_total: 123, vat_amount: 23 }, ctx);
    expect([z.pohoda_clenenie_dph, z.kv_clenenie]).toEqual([null, null]);
    const cz = resolveVatClassificationPrijatej({ country: "CZ", vat_payer: true, ic_dph: "CZ12345678" }, "prijata", { amount_total: 121, vat_amount: 21 }, {});
    expect(cz.kv_clenenie).toBeNull();
    expect(cz.pohoda_clenenie_dph).toBe("PD");
  });
});
