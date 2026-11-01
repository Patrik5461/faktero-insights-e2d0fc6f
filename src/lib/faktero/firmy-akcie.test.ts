import { describe, expect, it } from "vitest";
import { akciaUpravyFirmy } from "./firmy-akcie";

describe("Upraviť/Pozvať v Správe firiem (S-17)", () => {
  it("pri inej než aktívnej firme ju najprv prepne", () => {
    expect(akciaUpravyFirmy({ id: "b", role: "owner" }, "a")).toEqual({
      kam: "/firma",
      prepnut: true,
    });
    expect(akciaUpravyFirmy({ id: "a", role: "admin" }, "a")).toEqual({
      kam: "/firma",
      prepnut: false,
    });
  });
  it("účtovník, zamestnanec ani vlastný prístup tlačidlá nemajú", () => {
    for (const role of ["accountant", "employee", "custom", null])
      expect(akciaUpravyFirmy({ id: "a", role }, "a")).toBeNull();
  });
});
