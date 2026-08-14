import { describe, it, expect } from "vitest";
import { minulyMesiac } from "./odovzdanie-cron.server";
import { rozsahMesiaca } from "./odovzdanie.server";

describe("mesačné odovzdanie — obdobie", () => {
  it("piaty deň v mesiaci posiela minulý mesiac", () => {
    expect(minulyMesiac(new Date("2026-08-05T05:00:00Z"))).toBe("2026-07");
  });

  it("v januári sa vracia do decembra minulého roka", () => {
    // Prelom roka je jediné miesto, kde sa dá pomýliť o dvanásť mesiacov.
    expect(minulyMesiac(new Date("2026-01-05T05:00:00Z"))).toBe("2025-12");
  });

  it("rozsah mesiaca je od prvého do prvého nasledujúceho", () => {
    // Horná hranica sa porovnáva ostro (`<`), takže posledný deň nevypadne
    // ani v mesiacoch s 28, 30 či 31 dňami.
    expect(rozsahMesiaca("2026-02")).toEqual({
      od: "2026-02-01",
      do: "2026-03-01",
      nazov: "február 2026",
    });
    expect(rozsahMesiaca("2026-12")).toEqual({
      od: "2026-12-01",
      do: "2027-01-01",
      nazov: "december 2026",
    });
  });

  it("obdobie sa pomenúva po slovensky", () => {
    expect(rozsahMesiaca("2026-07").nazov).toBe("júl 2026");
  });
});
