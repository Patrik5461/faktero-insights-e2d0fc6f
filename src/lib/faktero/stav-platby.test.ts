import { describe, expect, it } from "vitest";
import { stavPlatby } from "./stav-platby";

const zaklad = { sparovana: false, maNavrh: false, platiSaPrevodom: true, uhradena: false, aktivna: true };

describe("stavPlatby", () => {
  it("väzba na pohyb = spárovaná, aj keď je doklad uhradený", () => {
    expect(stavPlatby({ ...zaklad, sparovana: true })).toBe("sparovana");
    expect(stavPlatby({ ...zaklad, sparovana: true, uhradena: true })).toBe("sparovana");
    expect(stavPlatby({ ...zaklad, sparovana: true, maNavrh: true })).toBe("sparovana");
  });

  it("nájdený pohyb bez väzby = návrh", () => {
    expect(stavPlatby({ ...zaklad, maNavrh: true })).toBe("navrh");
    expect(stavPlatby({ ...zaklad, maNavrh: true, platiSaPrevodom: false })).toBe("navrh");
  });

  it("prevodom, neuhradená, bez pohybu = nenájdená", () => {
    expect(stavPlatby(zaklad)).toBe("nenajdena");
  });

  it("bez ikonky: koncept/storno, hotovosť či karta, ručne uhradené", () => {
    expect(stavPlatby({ ...zaklad, aktivna: false })).toBeNull();
    expect(stavPlatby({ ...zaklad, aktivna: false, sparovana: true })).toBeNull();
    expect(stavPlatby({ ...zaklad, aktivna: false, maNavrh: true })).toBeNull();
    expect(stavPlatby({ ...zaklad, platiSaPrevodom: false })).toBeNull();
    expect(stavPlatby({ ...zaklad, uhradena: true })).toBeNull();
    expect(stavPlatby({ ...zaklad, uhradena: true, maNavrh: true })).toBeNull();
  });
});
