import { describe, expect, it } from "vitest";
import { rozsahPredvolby } from "./rozsah-datumu";

describe("rozsahPredvolby", () => {
  const d = new Date(2026, 0, 15);
  it("tento a minulý mesiac cez prelom roka", () => {
    expect(rozsahPredvolby("tento_mesiac", d)).toEqual({ od: "2026-01-01", do: "2026-01-31" });
    expect(rozsahPredvolby("minuly_mesiac", d)).toEqual({ od: "2025-12-01", do: "2025-12-31" });
  });
  it("štvrťrok a rok, február v priestupnom roku", () => {
    expect(rozsahPredvolby("tento_stvrtrok", new Date(2028, 1, 10))).toEqual({
      od: "2028-01-01",
      do: "2028-03-31",
    });
    expect(rozsahPredvolby("minuly_mesiac", new Date(2028, 2, 3))).toEqual({
      od: "2028-02-01",
      do: "2028-02-29",
    });
    expect(rozsahPredvolby("tento_rok", d)).toEqual({ od: "2026-01-01", do: "2026-12-31" });
  });
});
