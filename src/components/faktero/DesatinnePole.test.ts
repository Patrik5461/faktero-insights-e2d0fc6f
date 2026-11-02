import { describe, expect, it } from "vitest";
import { precitajCislo } from "./DesatinnePole";

describe("precitajCislo", () => {
  it("čiarka aj bodka, rozpísané hodnoty", () => {
    expect(precitajCislo("12,5")).toBe(12.5);
    expect(precitajCislo("12.50")).toBe(12.5);
    expect(precitajCislo("12,")).toBe(12);
    expect(precitajCislo("1 234,56")).toBe(1234.56);
    expect(precitajCislo("-0,02")).toBe(-0.02);
    expect(precitajCislo("")).toBeNull();
    expect(precitajCislo("-")).toBeNull();
    expect(precitajCislo(",")).toBeNull();
  });
});
