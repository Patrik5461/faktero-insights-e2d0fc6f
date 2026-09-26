import { describe, it, expect } from "vitest";
import { sumaSDph, rozpadSDph, oMesiacNeskor } from "./predplatne-cena";

describe("cena predplatného", () => {
  it("Starter 9 € sa strhne ako 11,07 €", () => {
    expect(sumaSDph(900)).toBe(1107);
  });

  it("Premium 19 € sa strhne ako 23,37 €", () => {
    expect(sumaSDph(1900)).toBe(2337);
  });

  it("rozpad vráti presne to, čo sa strhlo", () => {
    const r = rozpadSDph(1107);
    expect(r.zaklad).toBe(900);
    expect(r.dan).toBe(207);
    expect(r.zaklad + r.dan).toBe(1107);
  });

  it("nula a nezmysly nespadnú", () => {
    expect(sumaSDph(0)).toBe(0);
    expect(sumaSDph(Number.NaN)).toBe(0);
  });
});

describe("dátum obnovy", () => {
  it("bežný mesiac posunie o jeden", () => {
    expect(oMesiacNeskor("2026-03-15T08:00:00Z").toISOString().slice(0, 10)).toBe("2026-04-15");
  });

  it("31. januára padne na koniec februára, nie do marca", () => {
    expect(oMesiacNeskor("2026-01-31T08:00:00Z").toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("v priestupnom roku na 29. februára", () => {
    expect(oMesiacNeskor("2028-01-31T08:00:00Z").toISOString().slice(0, 10)).toBe("2028-02-29");
  });

  it("december prejde do januára ďalšieho roka", () => {
    expect(oMesiacNeskor("2026-12-31T08:00:00Z").toISOString().slice(0, 10)).toBe("2027-01-31");
  });

  it("čas dňa ostáva zachovaný", () => {
    expect(oMesiacNeskor("2026-03-15T08:30:00Z").toISOString()).toContain("T08:30:00");
  });
});
