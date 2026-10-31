import { describe, expect, it } from "vitest";
import { DAVKA_SCHVALOVANIA, poDavkach } from "./useStavSchvalovania";

describe("poDavkach", () => {
  it("zoznam nad 1 000 dokladov rozdelí tak, že žiadna dávka neprekročí limit servera", () => {
    const ids = Array.from({ length: 2345 }, (_, i) => String(i));
    const d = poDavkach(ids, DAVKA_SCHVALOVANIA);
    expect(d.map((x) => x.length)).toEqual([500, 500, 500, 500, 345]);
    expect(d.flat()).toEqual(ids);
    expect(Math.max(...d.map((x) => x.length))).toBeLessThanOrEqual(1000);
  });

  it("prázdny zoznam nemá dávku", () => {
    expect(poDavkach([], 500)).toEqual([]);
  });
});
