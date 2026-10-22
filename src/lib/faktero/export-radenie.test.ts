import { describe, expect, it } from "vitest";
import { zoradNaExport } from "./export-radenie";

const rows = [
  { id: "a", issue_date: "2026-10-05", invoice_number: "FA10", created_at: "2026-10-07T08:00:00Z" },
  { id: "b", issue_date: "2026-10-01", invoice_number: "FA9", created_at: "2026-10-08T08:00:00Z" },
  {
    id: "c",
    issue_date: "2026-10-03",
    invoice_number: "FA100",
    created_at: "2026-10-06T08:00:00Z",
  },
];

describe("zoradNaExport", () => {
  it("podľa dátumu, čísla (číselne) aj poradia nahratia", () => {
    expect(zoradNaExport(rows, "datum").map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(zoradNaExport(rows, "cislo").map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(zoradNaExport(rows, "nahratie").map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
  it("bez voľby nechá poradie a pôvodné pole nemení", () => {
    expect(zoradNaExport(rows, null)).toBe(rows);
    zoradNaExport(rows, "datum");
    expect(rows[0].id).toBe("a");
  });
});
