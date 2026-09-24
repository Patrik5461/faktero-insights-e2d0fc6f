import { describe, expect, it } from "vitest";
import {
  jeCerstve,
  jeEuIcDph,
  jeTuzemske,
  rozdelIcDph,
  upravIcDph,
  vysledokZOdpovede,
} from "./vies";

describe("IČ DPH", () => {
  it("medzery, bodky a pomlčky sa zahodia", () => {
    expect(upravIcDph(" cz 123-456.78 ")).toBe("CZ12345678");
  });

  it("grécke IČ DPH má kód EL, nie GR", () => {
    expect(rozdelIcDph("GR123456789")?.kod).toBe("EL");
  });

  it("pozná členské štáty vrátane Severného Írska", () => {
    expect(jeEuIcDph("CZ12345678")).toBe(true);
    expect(jeEuIcDph("XI123456789")).toBe(true);
    expect(jeEuIcDph("CH123456")).toBe(false);
    expect(jeEuIcDph("nezmysel")).toBe(false);
  });

  it("tuzemské IČ DPH sa pri dodaní do EÚ neoveruje", () => {
    expect(jeTuzemske("SK2020123456")).toBe(true);
    expect(jeTuzemske("CZ12345678")).toBe(false);
  });
});

describe("odpoveď VIES", () => {
  it("platné IČ DPH nesie názov, adresu aj potvrdenie", () => {
    const v = vysledokZOdpovede({
      isValid: true,
      name: "Firma s.r.o.",
      address: "Ulica 1\n110 00 Praha",
      requestIdentifier: "WAPIAAAA",
      userError: "VALID",
      requestDate: "2026-09-24T10:00:00.000Z",
    });
    expect(v).toMatchObject({
      platne: true,
      nazov: "Firma s.r.o.",
      adresa: "Ulica 1, 110 00 Praha",
      potvrdenie: "WAPIAAAA",
      chyba: null,
    });
  });

  it("prázdne polia chodia ako pomlčky a nemajú sa uložiť", () => {
    const v = vysledokZOdpovede({ isValid: false, name: "---", address: "---", userError: "INVALID" });
    expect(v.platne).toBe(false);
    expect(v.nazov).toBeNull();
    expect(v.adresa).toBeNull();
    expect(v.chyba).toBe("INVALID");
  });
});

describe("čerstvosť overenia", () => {
  it("overenie staršie než 30 dní už nestačí", () => {
    const dnes = new Date("2026-09-24T12:00:00Z");
    expect(jeCerstve("2026-09-20T12:00:00Z", dnes)).toBe(true);
    expect(jeCerstve("2026-08-01T12:00:00Z", dnes)).toBe(false);
    expect(jeCerstve(null, dnes)).toBe(false);
  });
});
