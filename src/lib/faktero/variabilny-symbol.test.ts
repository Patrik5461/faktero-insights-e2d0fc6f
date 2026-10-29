import { describe, expect, it } from "vitest";
import {
  vsNaUlozenie,
  vsPrijatej,
  vsPrijatejNaUlozenie,
  vsVystavenej,
  vsZCislaDokladu,
  vsZCislaPrijatej,
} from "./variabilny-symbol";

describe("VS vystaveného dokladu z čísla", () => {
  it("berie číslice z čísla", () => {
    expect(vsZCislaDokladu("FA-2026-0042")).toBe("20260042");
    expect(vsZCislaDokladu("DDP2026/7")).toBe("20267");
    expect(vsZCislaDokladu("2026000211")).toBe("2026000211");
  });
  it("dlhé číslo skráti na posledných 10 číslic", () => {
    expect(vsZCislaDokladu("2026-10-000001")).toBe("2610000001");
  });
  it("bez číslic vráti prázdno", () => {
    expect(vsZCislaDokladu("KONCEPT")).toBe("");
    expect(vsZCislaDokladu(null)).toBe("");
    expect(vsZCislaDokladu(undefined)).toBe("");
  });
});

describe("VS prijatej faktúry z čísla", () => {
  it("číslo celé z číslic použije aj s nulami na začiatku", () => {
    expect(vsZCislaPrijatej("0000020375")).toBe("0000020375");
    expect(vsZCislaPrijatej(" 1612 869951 ")).toBe("1612869951");
  });
  it("písmená alebo viac ako 10 číslic nepoužije", () => {
    expect(vsZCislaPrijatej("FV/2026/42")).toBe("");
    expect(vsZCislaPrijatej("12345678901")).toBe("");
    expect(vsZCislaPrijatej("")).toBe("");
  });
});

describe("zobrazenie a uloženie", () => {
  it("zadaný VS sa neprepisuje", () => {
    expect(vsVystavenej({ variable_symbol: "777", invoice_number: "FA-2026-1" })).toBe("777");
    expect(vsPrijatej({ variable_symbol: "86789175", invoice_number: "1612869951" })).toBe(
      "86789175",
    );
    expect(vsNaUlozenie(" 555 ", "FA-1")).toBe("555");
    expect(vsPrijatejNaUlozenie("RF18539007547034", "123")).toBe("RF18539007547034");
  });
  it("prázdny VS sa odvodí z čísla", () => {
    expect(vsVystavenej({ variable_symbol: "", invoice_number: "FA-2026-0042" })).toBe("20260042");
    expect(vsVystavenej({ variable_symbol: null, invoice_number: "DDP-2026-3" })).toBe("20263");
    expect(vsPrijatej({ variable_symbol: null, invoice_number: "0000020375" })).toBe("0000020375");
    expect(vsPrijatej({ variable_symbol: "  ", invoice_number: "FA-12" })).toBe("");
    expect(vsNaUlozenie("", "FA-2026-0042")).toBe("20260042");
    expect(vsNaUlozenie(undefined, "BEZ")).toBeNull();
    expect(vsPrijatejNaUlozenie(null, "0000020375")).toBe("0000020375");
    expect(vsPrijatejNaUlozenie(null, "FV-1")).toBeNull();
  });
  it("prázdny doklad", () => {
    expect(vsVystavenej(null)).toBe("");
    expect(vsPrijatej(undefined)).toBe("");
  });
});
