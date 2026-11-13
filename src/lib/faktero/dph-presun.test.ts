import { describe, expect, it } from "vitest";
import { rozpisPrePresun } from "./dph-presun";

describe("rozpis DPH pri presune dokladu", () => {
  const o = { krajina: "SK", den: "2026-10-15" };
  it("platný uložený rozpis prenesie, ako je", () => {
    const r = [
      { sadzba: 5, zaklad: 200, dph: 10 },
      { sadzba: 23, zaklad: 100, dph: 23 },
    ];
    expect(rozpisPrePresun(r, 300, 33, o)).toBe(r);
  });
  it("zmiešaná hlavička bez rozpisu: nevymyslí 11 % (predtým Math.round pomeru)", () => {
    expect(rozpisPrePresun(null, 300, 33, o)).toBeNull();
  });
  it("jedna zákonná sadzba z hlavičky", () => {
    expect(rozpisPrePresun(null, 100, 23, o)).toEqual([{ sadzba: 23, zaklad: 100, dph: 23 }]);
    expect(rozpisPrePresun([{ sadzba: 22, zaklad: 100, dph: 22 }], 100, 23, o)).toEqual([
      { sadzba: 23, zaklad: 100, dph: 23 },
    ]);
  });
  it("DPH 0 bez rozpisu", () => {
    expect(rozpisPrePresun(null, 50, 0, o)).toBeNull();
  });
  it("zahraničný dodávateľ (HU z IČ DPH) si rozpis s 27 % ponechá", () => {
    const r = [{ sadzba: 27, zaklad: 100, dph: 27 }];
    expect(rozpisPrePresun(r, 100, 27, { ...o, icDph: "HU12345678" })).toBe(r);
  });
});
