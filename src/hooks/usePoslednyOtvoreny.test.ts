import { describe, expect, it } from "vitest";
import { vlastnostiRiadku } from "./usePoslednyOtvoreny";
import { OZNACENIE_V_NAHLADE } from "@/lib/faktero/posledny-otvoreny";

const ref = () => {};

describe("vlastnostiRiadku", () => {
  it("naposledy otvorený doklad nemá žiadnu farbu, len ref na dorolovanie", () => {
    const p = vlastnostiRiadku("a", "a", null, ref);
    expect(p.className).toBe("");
    expect(p.ref).toBe(ref);
    expect(p["aria-current"]).toBeUndefined();
  });

  it("bez bočného náhľadu nie je zvýraznený žiadny riadok", () => {
    for (const x of ["a", "b", "c"]) {
      expect(vlastnostiRiadku(x, "b", undefined, ref).className).toBe("");
    }
  });

  it("doklad v bočnom náhľade má neutrálne označenie, nie zelené", () => {
    const p = vlastnostiRiadku("b", "a", "b", ref);
    expect(p.className).toBe(OZNACENIE_V_NAHLADE);
    expect(p.className).not.toMatch(/primary/);
    expect(p["aria-current"]).toBe(true);
    expect(p.ref).toBeUndefined();
    // Naposledy otvorený, ktorý nie je v náhľade, ostáva bez farby.
    expect(vlastnostiRiadku("a", "a", "b", ref).className).toBe("");
  });

  it("žiadna trieda neobsahuje zelený pruh", () => {
    expect(OZNACENIE_V_NAHLADE).not.toMatch(/primary|inset|shadow|border-l/);
  });
});
