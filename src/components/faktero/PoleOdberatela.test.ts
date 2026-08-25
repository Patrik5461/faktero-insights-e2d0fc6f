import { describe, it, expect } from "vitest";
import { adresaOdberatela } from "./PoleOdberatela";

describe("adresa odberateľa do poľa Kam", () => {
  it("poskladá ulicu, PSČ a mesto", () => {
    expect(
      adresaOdberatela({ id: "1", name: "Firma", street: "Hlavná 12", city: "Trnava", zip: "917 01" }),
    ).toBe("Hlavná 12, 917 01 Trnava");
  });

  it("bez ulice vezme aspoň mesto", () => {
    expect(adresaOdberatela({ id: "1", name: "Firma", street: null, city: "Nitra", zip: null })).toBe(
      "Nitra",
    );
  });

  it("bez adresy vráti meno — hľadanie trasy si s ním poradí lepšie než s prázdnom", () => {
    expect(
      adresaOdberatela({ id: "1", name: "Papiernictvo Lipa", street: null, city: null, zip: null }),
    ).toBe("Papiernictvo Lipa");
  });

  it("prázdne reťazce sa neberú ako adresa", () => {
    expect(adresaOdberatela({ id: "1", name: "Firma", street: "  ", city: "", zip: "" })).toBe("Firma");
  });

  it("bez odberateľa nevráti nič", () => {
    expect(adresaOdberatela(null)).toBe("");
  });
});
