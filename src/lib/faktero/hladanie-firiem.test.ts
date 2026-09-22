import { describe, expect, it } from "vitest";
import { filtrujFirmy } from "./hladanie-firiem";

const firmy = [
  { id: "1", name: "Žilinská stavebná a.s.", ico: "12345678" },
  { id: "2", name: "Novák s.r.o., Bratislava", ico: "87654321" },
  { id: "3", name: "Alfa Consulting", ico: null },
];

describe("hľadanie firiem", () => {
  it("bez diakritiky, viac slov, IČO", () => {
    expect(filtrujFirmy(firmy, "zilinska").map((f) => f.id)).toEqual(["1"]);
    expect(filtrujFirmy(firmy, "novak bra").map((f) => f.id)).toEqual(["2"]);
    expect(filtrujFirmy(firmy, "8765").map((f) => f.id)).toEqual(["2"]);
    expect(filtrujFirmy(firmy, "xyz")).toEqual([]);
  });
  it("abecedne po slovensky, aktívna prvá", () => {
    expect(filtrujFirmy(firmy, "").map((f) => f.id)).toEqual(["3", "2", "1"]);
    expect(filtrujFirmy(firmy, "", "1").map((f) => f.id)).toEqual(["1", "3", "2"]);
  });
});
