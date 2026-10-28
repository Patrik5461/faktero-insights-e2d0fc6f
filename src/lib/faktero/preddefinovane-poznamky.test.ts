import { describe, expect, it } from "vitest";
import {
  platiPreAgendu,
  popisPoznamky,
  poznamkyPreAgendu,
  upravAgendy,
  vlozDoPoznamky,
} from "./preddefinovane-poznamky";

const p = (id: string, agendy: string[], poradie = 0, nazov = "") => ({
  id,
  nazov,
  text: `Text ${id}`,
  agendy,
  poradie,
});

describe("preddefinované poznámky", () => {
  it("prázdne agendy platia všade", () => {
    expect(platiPreAgendu({ agendy: [] }, "faktura")).toBe(true);
    expect(platiPreAgendu({ agendy: ["blocek"] }, "faktura")).toBe(false);
    expect(platiPreAgendu({ agendy: ["blocek"] }, null)).toBe(true);
  });

  it("filtruje a zoraďuje podľa poradia a názvu", () => {
    const z = [
      p("a", ["blocek"], 1),
      p("b", [], 2, "B"),
      p("c", ["faktura"], 0, "C"),
      p("d", [], 2, "A"),
    ];
    expect(poznamkyPreAgendu(z, "faktura").map((x) => x.id)).toEqual(["c", "d", "b"]);
  });

  it("vloží na nový riadok a neopakuje", () => {
    expect(vlozDoPoznamky("", "Ďakujeme")).toBe("Ďakujeme");
    expect(vlozDoPoznamky("Prvá\n", "Ďakujeme")).toBe("Prvá\nĎakujeme");
    expect(vlozDoPoznamky("Prvá\nĎakujeme", "Ďakujeme")).toBe("Prvá\nĎakujeme");
  });

  it("popis je názov alebo začiatok textu", () => {
    expect(popisPoznamky({ nazov: "Záruka", text: "x" })).toBe("Záruka");
    expect(popisPoznamky({ nazov: "", text: "a ".repeat(50) }, 10)).toBe("a a a a a…");
  });

  it("všetky agendy = všade", () => {
    expect(upravAgendy(["faktura", "blocek", "x"])).toEqual(["faktura", "blocek"]);
    expect(upravAgendy(["faktura", "prijata_faktura", "blocek", "nespracovane"])).toEqual([]);
    expect(upravAgendy(null)).toEqual([]);
  });
});
