import { describe, expect, it } from "vitest";
import { danovaSplatnost, popisSplatnosti, predlzena } from "./splatnost";

describe("predĺženie splatnosti", () => {
  it("DPH sa počíta od pôvodnej splatnosti", () => {
    expect(danovaSplatnost({ due_date: "2026-11-30", povodna_splatnost: "2026-10-31" })).toBe("2026-10-31");
    expect(danovaSplatnost({ due_date: "2026-11-30" })).toBe("2026-11-30");
  });
  it("popis", () => {
    expect(popisSplatnosti({ due_date: "2026-11-30", povodna_splatnost: "2026-10-31" })).toBe(
      "30. 11. 2026 (predĺžená, pôvodne 31. 10. 2026)",
    );
    expect(popisSplatnosti({ due_date: "2026-10-15", povodna_splatnost: "2026-10-31" })).toMatch(/skrátená/);
    expect(popisSplatnosti({ due_date: "2026-10-31", povodna_splatnost: "2026-10-31" })).toBe("31. 10. 2026");
    expect(predlzena({ due_date: "2026-10-31" })).toBe(false);
  });
});
