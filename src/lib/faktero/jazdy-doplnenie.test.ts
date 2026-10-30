import { describe, expect, it, vi } from "vitest";

vi.mock("./geokodovanie.server", () => ({ adresaZBodu: vi.fn() }));

import { ostaneNedoplnena } from "./jazdy-doplnenie.server";

describe("ostaneNedoplnena", () => {
  const plna = { start_location: "A", end_location: "B", driver_name: "Jano" };

  it("úplne doplnená jazda nie je neúspešný pokus", () => {
    expect(ostaneNedoplnena({ ...plna, end_location: null }, { end_location: "B" })).toBe(false);
  });

  it("chýbajúca adresa po pokuse je neúspech", () => {
    expect(ostaneNedoplnena({ ...plna, end_location: null }, {})).toBe(true);
  });

  it("chýbajúci vodič po pokuse je neúspech", () => {
    expect(ostaneNedoplnena({ ...plna, driver_name: null }, { start_location: "C" })).toBe(true);
  });
});
