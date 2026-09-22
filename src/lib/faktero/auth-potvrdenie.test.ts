import { describe, expect, it } from "vitest";
import { bezpecnyCiel, jeTypPotvrdenia } from "./auth-potvrdenie";

describe("potvrdenie z e-mailu", () => {
  const o = "https://www.faktero.sk";
  it("pustí len cesty na našom webe", () => {
    expect(bezpecnyCiel("/dashboard", o)).toBe("/dashboard");
    expect(bezpecnyCiel("https://www.faktero.sk/pridat-pouzivatela?token=ab", o)).toBe("/pridat-pouzivatela?token=ab");
    expect(bezpecnyCiel("https://faktero.sk/onboarding", o)).toBe("/onboarding");
  });
  it("cudzie adresy a triky skončia na predvolenej", () => {
    expect(bezpecnyCiel("https://zly.example/phish", o)).toBe("/dashboard");
    expect(bezpecnyCiel("//zly.example", o)).toBe("/dashboard");
    expect(bezpecnyCiel("/\\zly.example", o)).toBe("/dashboard");
    expect(bezpecnyCiel("javascript:alert(1)", o)).toBe("/dashboard");
    expect(bezpecnyCiel("http://www.faktero.sk/x", o)).toBe("/dashboard");
    expect(bezpecnyCiel(undefined, o)).toBe("/dashboard");
  });
  it("typy", () => {
    expect(jeTypPotvrdenia("signup")).toBe(true);
    expect(jeTypPotvrdenia("x")).toBe(false);
  });
});
