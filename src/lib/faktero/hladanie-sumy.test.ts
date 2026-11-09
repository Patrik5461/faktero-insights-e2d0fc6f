import { describe, expect, it } from "vitest";
import { podmienkySumy, sumaZHladania } from "./hladanie-sumy";

describe("hľadanie podľa sumy", () => {
  it("rozpozná sumy v bežných zápisoch", () => {
    expect(sumaZHladania("120")).toBe(120);
    expect(sumaZHladania("120,50")).toBe(120.5);
    expect(sumaZHladania("1 234,56 €")).toBe(1234.56);
    expect(sumaZHladania("1.234,56")).toBe(1234.56);
    expect(sumaZHladania("1,234.56")).toBe(1234.56);
    expect(sumaZHladania("-20.5")).toBe(20.5);
    expect(sumaZHladania("12 000")).toBe(12000);
  });
  it("text, VS či prázdne sumou nie sú", () => {
    expect(sumaZHladania("Alza")).toBeNull();
    expect(sumaZHladania("")).toBeNull();
    expect(sumaZHladania("0")).toBeNull();
    expect(sumaZHladania("120 Alza")).toBeNull();
  });
  it("podmienky pokrývajú príjem aj výdaj", () => {
    expect(podmienkySumy("amount", 120.5)).toEqual(["amount.eq.120.5", "amount.eq.-120.5"]);
  });
});
