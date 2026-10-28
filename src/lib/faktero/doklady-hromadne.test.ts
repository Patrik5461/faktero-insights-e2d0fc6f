import { describe, expect, it } from "vitest";
import {
  dovodZamku,
  platbaPreZoradenie,
  splnaStavAStitok,
  stavPoUhrade,
  upravStitky,
} from "./doklady-hromadne";

describe("dovodZamku", () => {
  it("odovzdaný doklad je zamknutý pred všetkým ostatným", () => {
    expect(
      dovodZamku({ exported_at: "2026-10-01T10:00:00Z", issue_date: "2026-10-05" }, null),
    ).toBe("odovzdany");
    expect(dovodZamku({ issue_date: "2026-10-05" }, null, true)).toBe("odovzdany");
  });
  it("ručne zamknutý", () => {
    expect(dovodZamku({ locked_at: "2026-10-01T10:00:00Z" }, null)).toBe("zamknuty");
  });
  it("uzavreté obdobie vrátane posledného dňa", () => {
    expect(dovodZamku({ issue_date: "2026-09-30" }, "2026-09-30")).toBe("obdobie");
    expect(dovodZamku({ issue_date: "2026-10-01" }, "2026-09-30")).toBeNull();
  });
  it("bez dátumu a bez uzávierky sa meniť dá", () => {
    expect(dovodZamku({}, "2026-09-30")).toBeNull();
    expect(dovodZamku({ issue_date: "2020-01-01" }, null)).toBeNull();
  });
});

describe("upravStitky", () => {
  it("pridá bez duplicity (veľkosť písmen nehrá rolu)", () => {
    expect(upravStitky(["Projekt X"], "projekt x").stitky).toEqual(["Projekt X"]);
    expect(upravStitky(["a"], " b ").stitky).toEqual(["a", "b"]);
  });
  it("odoberie", () => {
    expect(upravStitky(["a", "B"], null, "b").stitky).toEqual(["a"]);
  });
  it("šiesty sa nepridá", () => {
    const v = upravStitky(["1", "2", "3", "4", "5"], "6");
    expect(v.plne).toBe(true);
    expect(v.stitky).toHaveLength(5);
  });
});

describe("stavPoUhrade", () => {
  it("prijatá: uhradená a späť podľa zaúčtovania", () => {
    expect(stavPoUhrade("prijata", { status: "received" }, true)).toBe("paid");
    expect(stavPoUhrade("prijata", { status: "paid", zauctovane_at: "x" }, false)).toBe("booked");
    expect(stavPoUhrade("prijata", { status: "paid" }, false)).toBe("received");
  });
  it("vystavená: späť na odoslanú alebo vystavenú", () => {
    expect(stavPoUhrade("vystavena", { status: "paid", sent_at: "x" }, false)).toBe("sent");
    expect(stavPoUhrade("vystavena", { status: "paid" }, false)).toBe("issued");
  });
  it("koncept, storno a už zaplatená sa nemenia", () => {
    expect(stavPoUhrade("vystavena", { status: "draft" }, true)).toBeNull();
    expect(stavPoUhrade("prijata", { status: "cancelled" }, true)).toBeNull();
    expect(stavPoUhrade("prijata", { status: "paid" }, true)).toBeNull();
    expect(stavPoUhrade("prijata", { status: "received" }, false)).toBeNull();
  });
});

describe("platbaPreZoradenie", () => {
  it("zjednotí slovenské a anglické kódy", () => {
    expect(platbaPreZoradenie("bank_transfer")).toBe("prevod");
    expect(platbaPreZoradenie("karta")).toBe("karta");
    expect(platbaPreZoradenie("cash")).toBe("hotovost");
    expect(platbaPreZoradenie(null)).toBeNull();
  });
});

describe("splnaStavAStitok", () => {
  it("filter stavu a štítku", () => {
    expect(splnaStavAStitok({ stav_id: "s1" }, "s1", "")).toBe(true);
    expect(splnaStavAStitok({ stav_id: "s1" }, "s2", "")).toBe(false);
    expect(splnaStavAStitok({ stav_id: null }, "_bez", "")).toBe(true);
    expect(splnaStavAStitok({ stav_id: "s1" }, "_bez", "")).toBe(false);
    expect(splnaStavAStitok({ stitky: ["a"] }, "", "a")).toBe(true);
    expect(splnaStavAStitok({ stitky: [] }, "", "a")).toBe(false);
  });
});
