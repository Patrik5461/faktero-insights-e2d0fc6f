import { describe, expect, it } from "vitest";
import { nazovSuboruSFirmou, slugFirmy } from "./nazov-suboru-firmy";

describe("slugFirmy", () => {
  it.each([
    ["PALIERA s.r.o.", "PALIERA-sro"],
    ["PALIERA, s. r. o.", "PALIERA-sro"],
    ["RHJ s. r. o.", "RHJ-sro"],
    ["BYVAJLEPSIE s.r.o.", "BYVAJLEPSIE-sro"],
    ["Zavar spol. s r.o.", "Zavar-sro"],
    ["Zavar spol. s r. o.", "Zavar-sro"],
    ["Žltý kôň a. s.", "Zlty-kon-as"],
    ["Tatra Holding, a.s.", "Tatra-Holding-as"],
    ["Novák a spol., k.s.", "Novak-a-spol-ks"],
    ["Bratia Kováčovci, v. o. s.", "Bratia-Kovacovci-vos"],
    ["Šťastná Ľudmila – Účtovníctvo", "Stastna-Ludmila-Uctovnictvo"],
    ["Müller & Söhne GmbH", "Muller-Sohne-GmbH"],
    ["Straße AG", "Strasse-AG"],
    ["MAS Plus s.r.o.", "MAS-Plus-sro"],
    ["Peter a syn", "Peter-a-syn"],
    ["  --  ", ""],
    ["", ""],
  ])("%s → %s", (vstup, vystup) => {
    expect(slugFirmy(vstup)).toBe(vystup);
  });

  it("skráti na 40 znakov bez pomlčky na konci", () => {
    const s = slugFirmy("Veľmi dlhý názov obchodnej spoločnosti pre testovanie s. r. o.");
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s).not.toMatch(/-$/);
    expect(s.startsWith("Velmi-dlhy-nazov-obchodnej-spolocnosti")).toBe(true);
  });

  it("null a undefined", () => {
    expect(slugFirmy(null)).toBe("");
    expect(slugFirmy(undefined)).toBe("");
  });
});

describe("nazovSuboruSFirmou", () => {
  it("pridá firmu pred príponu", () => {
    expect(nazovSuboruSFirmou("pohoda-faktury-2026-11-18.xml", "PALIERA s.r.o.")).toBe(
      "pohoda-faktury-2026-11-18-PALIERA-sro.xml",
    );
    expect(nazovSuboruSFirmou("pohoda-prijate-20260001.xml", { name: "RHJ s. r. o." })).toBe(
      "pohoda-prijate-20260001-RHJ-sro.xml",
    );
    expect(nazovSuboruSFirmou("money_s3-prijate-2026-11-01.xml", "BYVAJLEPSIE s.r.o.")).toBe(
      "money_s3-prijate-2026-11-01-BYVAJLEPSIE-sro.xml",
    );
    expect(nazovSuboruSFirmou("isdoc-faktury-2026-11-01.zip", "Zavar s.r.o.")).toBe(
      "isdoc-faktury-2026-11-01-Zavar-sro.zip",
    );
  });

  it("DATEV ostane začínať EXTF_", () => {
    expect(nazovSuboruSFirmou("EXTF_Buchungsstapel_Rechnungen-2026-11-01.csv", "Muster GmbH")).toBe(
      "EXTF_Buchungsstapel_Rechnungen-2026-11-01-Muster-GmbH.csv",
    );
  });

  it("bez firmy alebo bez názvu nič nemení", () => {
    expect(nazovSuboruSFirmou("faktury.csv", null)).toBe("faktury.csv");
    expect(nazovSuboruSFirmou("faktury.csv", { name: "" })).toBe("faktury.csv");
    expect(nazovSuboruSFirmou("", "Firma s.r.o.")).toBe("");
  });

  it("bez prípony pridá firmu na koniec", () => {
    expect(nazovSuboruSFirmou("vypis", "Firma s.r.o.")).toBe("vypis-Firma-sro");
  });

  it("nepridá firmu druhýkrát", () => {
    const raz = nazovSuboruSFirmou("pohoda-faktury-2026-11.xml", "PALIERA s.r.o.");
    expect(nazovSuboruSFirmou(raz, "PALIERA s.r.o.")).toBe(raz);
  });
});
