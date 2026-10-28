import { describe, expect, it } from "vitest";
import { kvSPredvolenym } from "./kv-clenenie";

describe("predvolené členenie KV DPH firmy", () => {
  it("nahradí len odvodenie bežného dokladu", () => {
    expect(kvSPredvolenym("B2", "prijata", "X")).toBe("X");
    expect(kvSPredvolenym("B3", "doklady", "B2")).toBe("B2");
    expect(kvSPredvolenym(null, "faktura", "D2")).toBe("D2");
  });

  it("prenesenie, opravný doklad a vydané s prenesením ostávajú podľa zákona", () => {
    expect(kvSPredvolenym("B1", "prijata", "X")).toBe("B1");
    expect(kvSPredvolenym("C2", "prijata", "B3")).toBe("C2");
    expect(kvSPredvolenym("A2", "faktura", "D2")).toBe("A2");
  });

  it("bez predvoleného, pri neplatnom kóde a mimo Slovenska nemení nič", () => {
    expect(kvSPredvolenym("B2", "prijata", null)).toBe("B2");
    expect(kvSPredvolenym("B2", "prijata", "A1")).toBe("B2");
    expect(kvSPredvolenym(null, "faktura", "D2", false)).toBeNull();
  });
});
