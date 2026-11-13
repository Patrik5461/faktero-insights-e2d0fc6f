import { describe, it, expect } from "vitest";
import { jeClenenieSPrenesenim, varovaniaPrijatejPredExportom } from "./export-varovania";

const firma = { country: "SK" };
const zaklad = {
  type: "regular",
  invoice_number: "X1",
  amount_without_vat: 100,
  vat_amount: 23,
  pohoda_predkontacia: "501000 321000",
  zauctovane_at: "2026-11-12",
};

describe("upozornenia pred exportom prijatej do Pohody", () => {
  it("bežná faktúra 23 % bez upozornenia", () => {
    expect(varovaniaPrijatejPredExportom(zaklad, firma)).toEqual([]);
  });

  it("DPH, ktorá nezodpovedá žiadnej sadzbe (Tempus-Car 30,5 %)", () => {
    const v = varovaniaPrijatejPredExportom(
      { ...zaklad, amount_without_vat: 45914.31, vat_amount: 14005.69 },
      firma,
    );
    expect(v).toHaveLength(1);
    expect(v[0]).toContain("30,5");
    expect(v[0]).toContain("neexistuje");
  });

  it("zmiešané sadzby s rozpisom, ktorý sedí, sú v poriadku", () => {
    const v = varovaniaPrijatejPredExportom(
      {
        ...zaklad,
        amount_without_vat: 200,
        vat_amount: 23,
        vat_breakdown: [
          { sadzba: 23, zaklad: 100, dph: 23 },
          { sadzba: 0, zaklad: 100, dph: 0 },
        ],
      },
      firma,
    );
    expect(v).toEqual([]);
  });

  it("členenie PDsluz pri inom zvolenom režime DPH", () => {
    const v = varovaniaPrijatejPredExportom(
      { ...zaklad, vat_amount: 0, pohoda_clenenie_dph: "PDsluz", reverse_charge: false, dph_rezim: "tuzemsko" },
      firma,
    );
    expect(v.join(" ")).toContain("PDsluz");
    // S daňou nejde o celé prenesenie — upozorní aj bez režimu.
    expect(
      varovaniaPrijatejPredExportom({ ...zaklad, pohoda_clenenie_dph: "PDsluz", reverse_charge: false }, firma).join(" "),
    ).toContain("PDsluz");
    // Bez režimu a bez dane ho export berie ako prenesenie (jePrenesenieCele) — nie je čo hlásiť.
    expect(
      varovaniaPrijatejPredExportom({ ...zaklad, vat_amount: 0, pohoda_clenenie_dph: "PDsluz", reverse_charge: false }, firma),
    ).toEqual([]);
    expect(varovaniaPrijatejPredExportom({ ...zaklad, vat_amount: 0, pohoda_clenenie_dph: "PDsluz", reverse_charge: true }, firma)).toEqual([]);
  });

  it("nezaúčtovaná bez predkontácie", () => {
    const v = varovaniaPrijatejPredExportom({ ...zaklad, pohoda_predkontacia: null, zauctovane_at: null }, firma);
    expect(v.join(" ")).toContain("bez predkontácie");
    // S predvolenou predkontáciou firmy nič.
    expect(
      varovaniaPrijatejPredExportom({ ...zaklad, pohoda_predkontacia: null, zauctovane_at: null }, firma, {
        predkontaciaPrijata: "501000 321000",
      }).join(" "),
    ).toContain("nie je zaúčtovaná");
  });

  it("zálohová sa neposudzuje", () => {
    expect(varovaniaPrijatejPredExportom({ ...zaklad, type: "proforma", vat_amount: 7 }, firma)).toEqual([]);
  });

  it("rozozná členenie s prenesením", () => {
    expect(jeClenenieSPrenesenim("PDsluz")).toBe(true);
    expect(jeClenenieSPrenesenim("PDtovar")).toBe(true);
    expect(jeClenenieSPrenesenim("PD")).toBe(false);
    expect(jeClenenieSPrenesenim("PN")).toBe(false);
    expect(jeClenenieSPrenesenim("PDnadEU")).toBe(false);
    expect(jeClenenieSPrenesenim("MojePDP", "MojePDP")).toBe(true);
  });
});

import { jeSamozdanenie } from "./datum-prijatia";
import { datumyPrijateho } from "./export-nastavenia";

describe("dátum odpočtu pri prenesení bez príznaku (BÝVAJLEPŠIE 2622100045)", () => {
  it("faktúra bez DPH s členením PDsluz je samozdanenie a odpočet ide na DUZP", () => {
    const p = { dph_rezim: null, reverse_charge: false, vat_amount: 0, pohoda_clenenie_dph: "PDsluz" };
    expect(jeSamozdanenie(p)).toBe(true);
    const d = datumyPrijateho(
      { vystavenie: "2026-10-31", dodanie: "2026-10-30", dorucenie: "2026-11-11", prijatie: "2026-11-11", samozdanenie: jeSamozdanenie(p) },
      { datumZapisu: "vystavenie", datumOdpoctu: "neskorsi" } as any,
    );
    expect(d.odpocet).toBe("2026-10-30");
  });
  it("bežná faktúra s DPH ostáva na neskoršom z DUZP a prijatia", () => {
    expect(jeSamozdanenie({ dph_rezim: null, reverse_charge: false, vat_amount: 23, pohoda_clenenie_dph: "PD" })).toBe(false);
  });
});
