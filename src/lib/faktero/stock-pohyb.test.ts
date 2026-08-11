import { describe, expect, it } from "vitest";
import { pohybDelta, pohybText } from "./stock-pohyb";

describe("pohybDelta", () => {
  it("výdaj a faktúra uberajú aj z kladného množstva", () => {
    expect(pohybDelta("vydaj", 3)).toBe(-3);
    expect(pohybDelta("faktura", 2.5)).toBe(-2.5);
  });

  it("príjem a dobropis pridávajú", () => {
    expect(pohybDelta("prijem", 10)).toBe(10);
    expect(pohybDelta("dobropis", 4)).toBe(4);
  });

  it("oprava a inventúra si nesú znamienko samy", () => {
    expect(pohybDelta("oprava", -7)).toBe(-7);
    expect(pohybDelta("inventura", 5)).toBe(5);
  });

  it("nezmysly nespôsobia NaN", () => {
    expect(pohybDelta("prijem", null)).toBe(0);
    expect(pohybDelta(null, "x")).toBe(0);
  });
});

describe("pohybText", () => {
  it("ukáže smer pohybu", () => {
    expect(pohybText("vydaj", 3)).toBe("−3");
    expect(pohybText("prijem", 10)).toBe("+10");
    expect(pohybText("inventura", 0)).toBe("0");
  });
});
