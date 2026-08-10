import { describe, it, expect } from "vitest";
import { rozsahImportu } from "./import-superfaktura.server";
import { rozsahVolieb, volbyPreRozsah, PREDVOLENE_VOLBY } from "@/components/faktero/ImportOptions";

/*
 * Skutočný prípad z prevádzky: import z Pohody so 45 faktúrami dobehol so
 * stavom „hotovo", bez jedinej chyby — a zapísal 0 faktúr. V úlohe boli
 * uložené `customersOnly: true` aj `invoicesOnly: true`, lebo to boli dve
 * nezávislé políčka a zaškrtnúť obe vyzeralo ako „chcem oboje".
 */
describe("rozsah importu", () => {
  it("obe voľby naraz neznamenajú nezapísať nič", () => {
    expect(rozsahImportu({ customersOnly: true, invoicesOnly: true })).toBe("vsetko");
  });

  it("žiadna voľba znamená všetko", () => {
    expect(rozsahImportu({})).toBe("vsetko");
    expect(rozsahImportu({ updateExisting: true })).toBe("vsetko");
  });

  it("jedna voľba platí", () => {
    expect(rozsahImportu({ customersOnly: true })).toBe("odberatelia");
    expect(rozsahImportu({ invoicesOnly: true })).toBe("faktury");
  });
});

describe("voľby v stránke", () => {
  it("predvolene sa importuje všetko", () => {
    expect(rozsahVolieb(PREDVOLENE_VOLBY)).toBe("vsetko");
  });

  it("výber rozsahu sa nedá dostať do protirečenia", () => {
    for (const r of ["vsetko", "odberatelia", "faktury"] as const) {
      const v = volbyPreRozsah(PREDVOLENE_VOLBY, r);
      expect(v.customersOnly && v.invoicesOnly).toBe(false);
      expect(rozsahVolieb(v)).toBe(r);
      // Stránka a server musia rozumieť voľbám rovnako.
      expect(rozsahImportu(v)).toBe(r);
    }
  });

  it("prepnutie rozsahu nezhodí zaškrtnuté aktualizovanie", () => {
    const v = volbyPreRozsah({ ...PREDVOLENE_VOLBY, updateExisting: true }, "faktury");
    expect(v.updateExisting).toBe(true);
  });
});
