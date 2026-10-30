import { describe, expect, it } from "vitest";
import { nazovHlavnehoSkladu } from "./hlavny-sklad";

describe("nazovHlavnehoSkladu", () => {
  it("podľa jazyka aj krajiny firmy", () => {
    expect(nazovHlavnehoSkladu("CZ")).toBe("Hlavní sklad");
    expect(nazovHlavnehoSkladu("cs")).toBe("Hlavní sklad");
    expect(nazovHlavnehoSkladu("DE")).toBe("Hauptlager");
    expect(nazovHlavnehoSkladu("AT")).toBe("Hauptlager");
    expect(nazovHlavnehoSkladu("SK")).toBe("Hlavný sklad");
  });
  it("neznáme alebo prázdne je slovenské", () => {
    expect(nazovHlavnehoSkladu(null)).toBe("Hlavný sklad");
    expect(nazovHlavnehoSkladu("HU")).toBe("Hlavný sklad");
  });
});
