import { describe, expect, it } from "vitest";
import { sAktualnymCislom } from "./cislo-v-maile";

describe("číslo faktúry v maile", () => {
  it("staré číslo z okna nahradí aktuálnym v predmete aj texte", () => {
    expect(sAktualnymCislom("Faktúra 20260007", "20260007", "20260008")).toBe("Faktúra 20260008");
    expect(
      sAktualnymCislom(
        "Dobrý deň, posielame faktúru č. 20260007.\nVS: 20260007",
        "20260007",
        "20260008",
      ),
    ).toBe("Dobrý deň, posielame faktúru č. 20260008.\nVS: 20260008");
  });

  it("nemení časť iného čísla ani text bez starého čísla", () => {
    expect(sAktualnymCislom("Faktúra 202600071", "20260007", "20260008")).toBe("Faktúra 202600071");
    expect(sAktualnymCislom("FA20260007", "20260007", "20260008")).toBe("FA20260007");
    expect(sAktualnymCislom("Vlastný predmet", "20260007", "20260008")).toBe("Vlastný predmet");
  });

  it("bez zmeny čísla alebo bez údajov vráti text tak, ako je", () => {
    expect(sAktualnymCislom("Faktúra 20260007", "20260007", "20260007")).toBe("Faktúra 20260007");
    expect(sAktualnymCislom("Faktúra 20260007", null, "20260008")).toBe("Faktúra 20260007");
    expect(sAktualnymCislom(undefined, "20260007", "20260008")).toBeUndefined();
  });

  it("číslo so špeciálnymi znakmi sa berie doslova", () => {
    expect(sAktualnymCislom("Faktúra FA-2026/7", "FA-2026/7", "FA-2026/8")).toBe(
      "Faktúra FA-2026/8",
    );
    expect(sAktualnymCislom("Faktúra FA-2026x7", "FA-2026.7", "FA-2026/8")).toBe(
      "Faktúra FA-2026x7",
    );
  });
});
