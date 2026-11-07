import { describe, expect, it } from "vitest";
import { ocistiHladaniePravidiel } from "./ZauctovaniePravidla";

describe("predvyplnenie pravidla z adresy", () => {
  it("číselné IČO a VS z adresy ostanú (router ich vráti ako number)", () => {
    const h = ocistiHladaniePravidiel({ ico: 36123456, bvs: 2026001, nazov: "  Shell " });
    expect(h.ico).toBe("36123456");
    expect(h.bvs).toBe("2026001");
    expect(h.nazov).toBe("Shell");
    expect(ocistiHladaniePravidiel({ ico: Number.NaN, nazov: "" }).ico).toBeUndefined();
  });
});
