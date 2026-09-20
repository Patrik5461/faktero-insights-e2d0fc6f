import { describe, expect, it } from "vitest";
import { navratZoZachytu } from "./MobilApp";

/**
 * Doklad nasnímaný na skeneri končil inde, než kde začal: po uložení na
 * zozname dokladov a po „späť“ na obrazovke s dvomi tlačidlami, ktorá je
 * náhradou kamery pre web. Na telefóne to pôsobilo ako druhý, zjednodušený
 * skener.
 */
describe("návrat zo zachytávania dokladu", () => {
  it("zo skenera vedie späť na skener, nie na zoznam", () => {
    expect(navratZoZachytu("skener", true)).toBe("skener");
    expect(navratZoZachytu("skener", false)).toBe("skener");
  });

  it("z prehľadu ukáže po uložení zoznam dokladov", () => {
    expect(navratZoZachytu("prehlad", true)).toBe("doklady");
  });

  it("z prehľadu sa „späť“ vracia tam, odkiaľ sa prišlo", () => {
    expect(navratZoZachytu("prehlad", false)).toBe("prehlad");
  });
});
