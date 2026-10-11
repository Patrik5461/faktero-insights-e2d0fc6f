import { describe, expect, it } from "vitest";
import { kodKrajiny, mergeCompanyAutofill } from "./company-autofill";

describe("kodKrajiny", () => {
  it("názov z registra preloží na kód", () => {
    expect(kodKrajiny("Česká republika")).toBe("CZ");
    expect(kodKrajiny("Slovenská republika")).toBe("SK");
    expect(kodKrajiny("CZ")).toBe("CZ");
    expect(kodKrajiny("DE")).toBe("DE");
    expect(kodKrajiny("")).toBeNull();
  });
  it("autofill uloží kód krajiny", () => {
    const r = mergeCompanyAutofill(
      { name: "", country: "SK" } as any,
      { name: "ABRA Software s.r.o.", country: "Česká republika" } as any,
      { mode: "overwrite" },
    );
    expect((r as any).country).toBe("CZ");
  });
});
