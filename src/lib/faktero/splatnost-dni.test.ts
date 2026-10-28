import { describe, expect, it } from "vitest";
import { datumPoDnoch, dniMedzi } from "./splatnost-dni";

describe("splatnosť v dňoch", () => {
  it("pripočíta dni k dátumu vystavenia, aj cez koniec mesiaca a zmenu času", () => {
    expect(datumPoDnoch("2026-10-28", 14)).toBe("2026-11-11");
    expect(datumPoDnoch("2026-03-20", 14)).toBe("2026-04-03");
    expect(datumPoDnoch("2026-12-25", 7)).toBe("2027-01-01");
  });
  it("spočíta dni medzi dátumami", () => {
    expect(dniMedzi("2026-10-28", "2026-11-11")).toBe(14);
    expect(dniMedzi("2026-03-20", "2026-04-03")).toBe(14);
    expect(dniMedzi("2026-10-28", "2026-10-28")).toBe(0);
  });
  it("neplatný dátum nedá číslo", () => {
    expect(dniMedzi("", "2026-11-11")).toBeNull();
    expect(dniMedzi("2026-10-28", "")).toBeNull();
  });
});
