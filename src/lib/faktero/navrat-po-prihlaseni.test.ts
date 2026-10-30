import { describe, expect, it } from "vitest";
import { bezpecnyNavrat } from "./navrat-po-prihlaseni";

describe("bezpecnyNavrat", () => {
  it("vráti stránku webu aj s parametrami", () => {
    expect(bezpecnyNavrat("/faktury/nova?type=proforma")).toBe("/faktury/nova?type=proforma");
    expect(bezpecnyNavrat("/oauth/authorize?x=1")).toBe("/oauth/authorize?x=1");
  });
  it("cudziu adresu nepustí", () => {
    for (const z of [
      "//zly.sk",
      "/\\zly.sk",
      "https://zly.sk",
      "javascript:alert(1)",
      "zly",
      "",
      null,
      "/\nx",
    ])
      expect(bezpecnyNavrat(z as any)).toBeNull();
  });
  it("na prihlásenie sa nevracia", () => {
    expect(bezpecnyNavrat("/prihlasenie?dalej=/x")).toBeNull();
    expect(bezpecnyNavrat("/prihlasenie")).toBeNull();
    expect(bezpecnyNavrat("/prihlasenia-historia")).toBe("/prihlasenia-historia");
  });
});
