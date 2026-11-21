import { describe, expect, it } from "vitest";
import {
  jePlatnyIban,
  normalizujIban,
  normalizujKodPartnera,
  novyKodPartnera,
  odkazPartnera,
  stavProvizieDnes,
  suhrnProvizii,
} from "./partner-program";

describe("kód partnera", () => {
  it("nový kód má 6 znakov bez zameniteľných", () => {
    const kod = novyKodPartnera(new Uint8Array([0, 1, 2, 3, 250, 255]));
    expect(kod).toMatch(/^[A-Z2-9]{6}$/);
    expect(kod).not.toMatch(/[01OIL]/);
  });
  it("normalizuje kód z odkazu", () => {
    expect(normalizujKodPartnera(" ab12cd ")).toBe("AB12CD");
    expect(normalizujKodPartnera("x")).toBeNull();
    expect(normalizujKodPartnera("AB-12")).toBeNull();
    expect(normalizujKodPartnera(undefined)).toBeNull();
  });
  it("odkaz na registráciu", () => {
    expect(odkazPartnera("AB12CD")).toBe("https://www.faktero.sk/registracia?partner=AB12CD");
  });
});

describe("provízie", () => {
  const dnes = new Date("2026-11-21T12:00:00Z");
  it("po 30 dňoch je provízia na výplatu", () => {
    expect(stavProvizieDnes({ stav: "caka", zaplatene_at: "2026-10-22T12:00:00Z" }, dnes)).toBe("na_vyplatu");
    expect(stavProvizieDnes({ stav: "caka", zaplatene_at: "2026-11-01T12:00:00Z" }, dnes)).toBe("caka");
    expect(stavProvizieDnes({ stav: "storno", zaplatene_at: "2026-01-01T00:00:00Z" }, dnes)).toBe("storno");
  });
  it("súhrn nepočíta zrušené", () => {
    const s = suhrnProvizii(
      [
        { stav: "caka", zaplatene_at: "2026-11-10T00:00:00Z", provizia_cents: 380 },
        { stav: "caka", zaplatene_at: "2026-10-01T00:00:00Z", provizia_cents: 380 },
        { stav: "vyplatene", zaplatene_at: "2026-09-01T00:00:00Z", provizia_cents: 180 },
        { stav: "storno", zaplatene_at: "2026-11-12T00:00:00Z", provizia_cents: 999 },
      ],
      dnes,
    );
    expect(s).toEqual({ cakaCents: 380, naVyplatuCents: 380, vyplateneCents: 180, tentoMesiacCents: 380 });
  });
});

describe("IBAN", () => {
  it("overí kontrolnú číslicu", () => {
    expect(jePlatnyIban(normalizujIban("SK31 1200 0000 1987 4263 7541")!)).toBe(true);
    expect(jePlatnyIban("SK3112000000198742637542")).toBe(false);
    expect(normalizujIban("  ")).toBeNull();
  });
});
