import { describe, expect, it } from "vitest";
import { doplnObdobie } from "./opakovane-premenne";

describe("premenné obdobia v opakovanej faktúre", () => {
  it("doplní mesiac a rok podľa dátumu vystavenia", () => {
    expect(doplnObdobie("Paušál za [MESIAC] [ROK]", "2026-11-01")).toBe("Paušál za november 2026");
    expect(doplnObdobie("Paušál za [mesiac_rok]", "2026-10-30")).toBe("Paušál za október 2026");
  });

  it("minulý mesiac v januári je december minulého roka", () => {
    expect(doplnObdobie("Služby za [MINULY_MESIAC]", "2027-01-05")).toBe("Služby za december 2026");
    expect(doplnObdobie("Záloha na [BUDUCI_MESIAC]", "2026-12-20")).toBe("Záloha na január 2027");
  });

  it("v jazyku dokladu", () => {
    expect(doplnObdobie("[MESIAC]", "2026-10-01", "cs")).toBe("říjen");
    expect(doplnObdobie("[MESIAC]", "2026-10-01", "de")).toBe("Oktober");
    expect(doplnObdobie("[MESIAC]", "2026-10-01", "en")).toBe("October");
  });

  it("text bez značiek a neznáme značky nechá tak", () => {
    expect(doplnObdobie("Paušál október 2026", "2026-11-01")).toBe("Paušál október 2026");
    expect(doplnObdobie("[CISLO] [MESIAC]", "2026-11-01")).toBe("[CISLO] november");
    expect(doplnObdobie(null, "2026-11-01")).toBeNull();
  });
});
