import { describe, expect, it } from "vitest";
import { chybajuceUdaje, daSaSpracovat, jeZalozkaDokladov } from "./doklad-stav";

describe("stav dokladu", () => {
  it("neprečítaný bloček nemá nič a spracovať sa nedá", () => {
    const d = { total_amount: null, issue_date: null, supplier_name: null };
    expect(chybajuceUdaje(d)).toEqual(["suma", "dátum", "dodávateľ"]);
    expect(daSaSpracovat(d)).toBe(false);
  });

  it("bez dodávateľa sa spracovať dá, bez sumy nie", () => {
    expect(daSaSpracovat({ total_amount: 2.5, issue_date: "2026-09-21", supplier_name: " " })).toBe(true);
    expect(daSaSpracovat({ total_amount: null, issue_date: "2026-09-21", supplier_name: "Shell" })).toBe(false);
  });

  it("nulová suma je suma, nie chýbajúci údaj", () => {
    expect(chybajuceUdaje({ total_amount: 0, issue_date: "2026-09-21", supplier_name: "X" })).toEqual([]);
  });

  it("záložka z adresy", () => {
    expect(jeZalozkaDokladov("nespracovane")).toBe(true);
    expect(jeZalozkaDokladov("new")).toBe(false);
  });
});
