import { describe, it, expect } from "vitest";
import { mesiacKarty } from "./jazdy-prehlad";

describe("mesiacKarty (J-04)", () => {
  it("aktuálny rok: dnešný mesiac v Bratislave", () => {
    expect(mesiacKarty(2026, "2026-11-01")).toEqual({ od: "2026-11-01", aktualny: true });
  });
  it("minulý rok: december toho roka, nie nula", () => {
    expect(mesiacKarty(2025, "2026-11-01")).toEqual({ od: "2025-12-01", aktualny: false });
  });
});

describe("predvolené „Od“ v exporte jázd (J-16)", () => {
  it("tesne po polnoci v Bratislave nejde o deň skôr", async () => {
    const { posunMesiacBratislava } = await import("./datum-vystavenia");
    // 1. 11. 00:30 v Bratislave = 31. 10. 23:30 UTC
    expect(posunMesiacBratislava(-1, new Date("2026-10-31T23:30:00Z"))).toBe("2026-10-01");
  });
});
