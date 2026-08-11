import { describe, expect, it } from "vitest";
import { FAKTURY, mnozne, POLOZKY, sPoctom } from "./mnozne";

describe("mnozne", () => {
  it("berie tvar podľa počtu", () => {
    expect(mnozne(1, FAKTURY)).toBe("faktúra");
    expect(mnozne(2, FAKTURY)).toBe("faktúry");
    expect(mnozne(4, FAKTURY)).toBe("faktúry");
    expect(mnozne(5, FAKTURY)).toBe("faktúr");
    expect(mnozne(11, FAKTURY)).toBe("faktúr");
  });

  it("nula a záporné čísla nespadnú do zlého tvaru", () => {
    expect(mnozne(0, POLOZKY)).toBe("položiek");
    expect(mnozne(-1, POLOZKY)).toBe("položka");
  });

  it("sPoctom pridá číslo", () => {
    expect(sPoctom(3, POLOZKY)).toBe("3 položky");
  });
});
