import { describe, expect, it } from "vitest";
import {
  jeTestovacia,
  jeZastaveneTestom,
  nazovTestovacej,
  TestovaciaFirmaZastavene,
  zoradSTestovacimi,
} from "./testovacia-firma";

describe("testovacia firma — čistá logika", () => {
  it("jeTestovacia podľa testovacia_pre", () => {
    expect(jeTestovacia({ testovacia_pre: "abc" })).toBe(true);
    expect(jeTestovacia({ testovacia_pre: null })).toBe(false);
    expect(jeTestovacia({})).toBe(false);
    expect(jeTestovacia(null)).toBe(false);
  });

  it("názov s predponou, bez zdvojenia", () => {
    expect(nazovTestovacej("Firma s.r.o.")).toBe("Test – Firma s.r.o.");
    expect(nazovTestovacej("Test – Firma s.r.o.")).toBe("Test – Firma s.r.o.");
  });

  it("testovacia ide hneď pod svoju skutočnú firmu", () => {
    const firmy = [
      { id: "t-b", testovacia_pre: "b" },
      { id: "a", testovacia_pre: null },
      { id: "b", testovacia_pre: null },
      { id: "t-a", testovacia_pre: "a" },
      { id: "t-x", testovacia_pre: "x" },
    ];
    expect(zoradSTestovacimi(firmy).map((f) => f.id)).toEqual(["a", "t-a", "b", "t-b", "t-x"]);
  });

  it("rozpozná zastavenie testom aj po serializácii", () => {
    expect(jeZastaveneTestom(new TestovaciaFirmaZastavene())).toBe(true);
    expect(jeZastaveneTestom({ name: "TestovaciaFirmaZastavene" })).toBe(true);
    expect(jeZastaveneTestom(new Error("x"))).toBe(false);
  });
});
