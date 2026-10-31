import { describe, expect, it } from "vitest";
import { dalsiIndex } from "./fokus-okna";

describe("fokus v okne — Tab dokola", () => {
  it("z posledného prvku na prvý a Shift+Tab z prvého na posledný", () => {
    expect(dalsiIndex(3, 2, false)).toBe(0);
    expect(dalsiIndex(3, 0, true)).toBe(2);
    expect(dalsiIndex(3, 1, false)).toBe(2);
    expect(dalsiIndex(3, 1, true)).toBe(0);
  });
  it("fokus mimo okna: Tab na prvý, Shift+Tab na posledný", () => {
    expect(dalsiIndex(4, -1, false)).toBe(0);
    expect(dalsiIndex(4, -1, true)).toBe(3);
  });
  it("prázdne okno", () => {
    expect(dalsiIndex(0, -1, false)).toBe(-1);
  });
});
