import { describe, expect, it } from "vitest";
import { pohybyZastarane, popisChybyPohybov } from "./bank-stav-pohybov";

describe("stav pohybov bankového účtu", () => {
  it("SCA expired z Tatra banky sa preloží na výzvu obnoviť súhlas", () => {
    expect(
      popisChybyPohybov(
        'tb_api_error: 401 https://… {"errorCode":"SCA_EXPIRED","errorDescription":"SCA expired."}',
      ),
    ).toMatch(/vypršal/);
  });
  it("jednorazový výpadok sa neukáže, dlhé zlyhanie áno", () => {
    const teraz = new Date("2026-10-25T10:00:00Z");
    expect(
      pohybyZastarane({ pohyby_chyba: "x", pohyby_ok_at: "2026-10-25T04:00:00Z" }, teraz),
    ).toBe(false);
    expect(
      pohybyZastarane({ pohyby_chyba: "x", pohyby_ok_at: "2026-10-01T04:00:00Z" }, teraz),
    ).toBe(true);
    expect(pohybyZastarane({ pohyby_chyba: "x", pohyby_ok_at: null }, teraz)).toBe(true);
    expect(pohybyZastarane({ pohyby_chyba: null, pohyby_ok_at: null }, teraz)).toBe(false);
  });
});

describe("jeChybaSuhlasu", () => {
  it("SCA_EXPIRED a CONSENT_* áno, 500 nie", async () => {
    const { jeChybaSuhlasu } = await import("./bank-stav-pohybov");
    expect(jeChybaSuhlasu('tb_api_error: 401 {"errorCode":"SCA_EXPIRED"}')).toBe(true);
    expect(jeChybaSuhlasu("CONSENT_INVALID")).toBe(true);
    expect(jeChybaSuhlasu("tb_api_error: 500")).toBe(false);
  });
});
