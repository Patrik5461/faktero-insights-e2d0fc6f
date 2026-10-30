import { describe, expect, it } from "vitest";
import { kilometre } from "./km";

describe("kilometre", () => {
  it("desatinná čiarka podľa jazyka", () => {
    expect(kilometre(0.96, "sk-SK")).toBe("1,0");
    expect(kilometre(12.34, "de-DE")).toBe("12,3");
    expect(kilometre(12.34, "en-GB")).toBe("12.3");
  });
  it("prázdna hodnota je nula", () => {
    expect(kilometre(null, "sk-SK")).toBe("0,0");
    expect(kilometre("x", "sk-SK")).toBe("0,0");
  });
});
