import { describe, expect, it } from "vitest";
import { textRezimuCz } from "./rezim-texty-cz";

describe("texty daňového režimu českej firmy", () => {
  it("citujú český zákon a riadky českého priznania", () => {
    expect(
      textRezimuCz("Tuzemský prenos podľa §69 zákona o DPH (stavebné práce, kovový odpad…)"),
    ).toContain("§ 92a");
    expect(textRezimuCz("Vývoz tovaru (oslobodené podľa § 47)")).toContain("§ 66");
    expect(textRezimuCz("Dodanie služby (§ 15 ods. 1)")).toContain("§ 9 ods. 1");
    expect(
      textRezimuCz(
        "Vývoz tovaru ide do priznania (r. 13 a 15), služba s miestom dodania mimo EÚ do priznania nepatrí.",
      ),
    ).toContain("ř. 22");
    expect(textRezimuCz("iný text")).toBe("iný text");
  });
});
