import { describe, expect, it } from "vitest";
import { maZuctovanuZalohu, zostavaUhradit } from "./zaloha";

describe("zostavaUhradit", () => {
  it("odpočíta zaplatenú zálohu", () => {
    expect(zostavaUhradit(492, 246)).toBe(246);
  });

  it("bez zálohy platí celá suma", () => {
    expect(zostavaUhradit(492, null)).toBe(492);
    expect(zostavaUhradit(492, 0)).toBe(492);
    expect(zostavaUhradit("492.00", undefined)).toBe(492);
  });

  it("záloha vyššia než faktúra nespraví záporný predpis", () => {
    expect(zostavaUhradit(100, 246)).toBe(0);
  });

  it("zaokrúhľuje na centy", () => {
    expect(zostavaUhradit(120.55, 40.181)).toBe(80.37);
  });
});

describe("maZuctovanuZalohu", () => {
  it("nula ani prázdna hodnota sa na doklade neukazuje", () => {
    expect(maZuctovanuZalohu(null)).toBe(false);
    expect(maZuctovanuZalohu(0)).toBe(false);
    expect(maZuctovanuZalohu("0")).toBe(false);
  });

  it("kladná záloha áno", () => {
    expect(maZuctovanuZalohu(246)).toBe(true);
    expect(maZuctovanuZalohu("246.00")).toBe(true);
  });
});
