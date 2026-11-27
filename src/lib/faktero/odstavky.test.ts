import { describe, expect, it } from "vitest";
import { jeAktualna, kolizia, koniecOdstavky } from "./odstavky";

const o = (zaciatok: string, koniec: string | null, stav: any = "schvalene", zdroj: any = "fs") => ({ zaciatok, koniec, stav, zdroj });

describe("odstávky inštitúcií", () => {
  it("ukazuje sa 3 dni vopred až do konca, len schválená", () => {
    const x = o("2026-11-28T08:00:00Z", "2026-11-28T16:00:00Z");
    expect(jeAktualna(x, Date.parse("2026-11-24T08:00:00Z"))).toBe(false);
    expect(jeAktualna(x, Date.parse("2026-11-26T08:00:00Z"))).toBe(true);
    expect(jeAktualna(x, Date.parse("2026-11-28T10:00:00Z"))).toBe(true);
    expect(jeAktualna(x, Date.parse("2026-11-28T17:00:00Z"))).toBe(false);
    expect(jeAktualna({ ...x, stav: "navrh" }, Date.parse("2026-11-28T10:00:00Z"))).toBe(false);
  });
  it("bez konca platí 24 h", () => {
    expect(koniecOdstavky(o("2026-11-28T08:00:00Z", null))).toBe(Date.parse("2026-11-29T08:00:00Z"));
  });
  it("odstávka FS medzi 20. a 25. je kolízia s DPH, inde nie", () => {
    expect(kolizia(o("2026-11-24T19:00:00Z", "2026-11-24T22:00:00Z"))).toBe("dph");
    expect(kolizia(o("2026-11-26T19:00:00Z", "2026-11-26T22:00:00Z"))).toBeNull();
    expect(kolizia(o("2026-11-24T19:00:00Z", "2026-11-24T22:00:00Z", "schvalene", "upvs"))).toBeNull();
  });
});
