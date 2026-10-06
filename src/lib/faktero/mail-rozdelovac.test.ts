import { describe, expect, it } from "vitest";
import { firmaPodlaOdberatela, localPartRozdelovaca } from "./mail-rozdelovac";

const firmy = [
  { id: "a", name: "Alfa", ico: "12 345 678", ic_dph: "SK2020123456" },
  { id: "b", name: "Beta", ico: "87654321", ic_dph: null },
  { id: "c", name: "Gama", ico: null, ic_dph: "SK2020999999" },
];

describe("rozdeľovač", () => {
  it("priradí podľa IČO odberateľa bez ohľadu na medzery", () => {
    expect(firmaPodlaOdberatela({ buyer_ico: "12345678" }, firmy)?.id).toBe("a");
    expect(firmaPodlaOdberatela({ buyer_ico: "876 543 21" }, firmy)?.id).toBe("b");
  });
  it("bez IČO podľa IČ DPH", () => {
    expect(firmaPodlaOdberatela({ buyer_ic_dph: "sk2020999999" }, firmy)?.id).toBe("c");
  });
  it("cudzí odberateľ alebo nejasná zhoda ide na ručné priradenie", () => {
    expect(firmaPodlaOdberatela({ buyer_ico: "11111111" }, firmy)).toBeNull();
    expect(firmaPodlaOdberatela({}, firmy)).toBeNull();
    expect(
      firmaPodlaOdberatela({ buyer_ico: "87654321" }, [
        ...firmy,
        { id: "d", name: "Beta 2", ico: "87654321", ic_dph: null },
      ]),
    ).toBeNull();
  });
  it("adresa má náhodný chvost", () => {
    expect(localPartRozdelovaca(() => 0)).toBe("rozdelovac-aaaaaaaaaa");
    expect(localPartRozdelovaca()).toMatch(/^rozdelovac-[a-z2-9]{10}$/);
  });
});
