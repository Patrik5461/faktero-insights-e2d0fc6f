import { describe, expect, it } from "vitest";
import { poznamkaDokladuKPlatbe } from "./doklad-k-platbe";

describe("poznámka dokladu k prijatej platbe", () => {
  it("je v jazyku dokladu a s dátumom ako na doklade", () => {
    expect(poznamkaDokladuKPlatbe("cs", "2026-10-30", "ZF20260002")).toBe(
      "Daňový doklad k platbě přijaté 30. 10. 2026 k zálohové faktuře ZF20260002.",
    );
    expect(poznamkaDokladuKPlatbe("sk", "2026-10-30", "ZF1")).toBe(
      "Daňový doklad k platbe prijatej 30. 10. 2026 k zálohovej faktúre ZF1.",
    );
    expect(poznamkaDokladuKPlatbe(null, "2026-10-30", "ZF1")).toContain("prijatej");
    expect(poznamkaDokladuKPlatbe("en", "2026-10-30", "ZF1")).toContain("30/10/2026");
  });
});
