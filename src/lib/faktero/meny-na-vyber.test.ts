import { describe, expect, it } from "vitest";
import { menyNaVyber } from "./meny-na-vyber";
import { MENY } from "./mena";

describe("menyNaVyber (D-19)", () => {
  it("ponúkne celý číselník, nie len EUR/CZK/USD", () => {
    const kody = menyNaVyber("EUR").map((m) => m.code);
    expect(kody).toEqual(expect.arrayContaining(["EUR", "CZK", "USD", "PLN", "GBP", "HUF", "CHF"]));
  });
  it("mena dokladu mimo číselníka ostane na výber", () => {
    expect(menyNaVyber("sek").map((m) => m.code)).toContain("SEK");
    expect(menyNaVyber("PLN")).toBe(MENY);
  });
  it("nezmysel sa nepridá", () => {
    expect(menyNaVyber("€")).toBe(MENY);
    expect(menyNaVyber(null)).toBe(MENY);
  });
});
