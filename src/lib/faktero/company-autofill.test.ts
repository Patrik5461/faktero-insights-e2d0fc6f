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
  it("režim DPH sa prispôsobí krajine z registra", () => {
    const r = mergeCompanyAutofill(
      { name: "", country: "SK", vat_payer: false, vat_scheme: "sk_neplatitel" } as any,
      { name: "ABRA Software s.r.o.", country: "Česká republika" } as any,
      { mode: "overwrite" },
    );
    expect((r as any).vat_scheme).toBe("cz_neplatce");
  });
  it("česká firma, ktorú ARES hlási ako platiteľa, sa zaškrtne ako platiteľ", () => {
    const r = mergeCompanyAutofill(
      { name: "", country: "SK", vat_payer: false, vat_scheme: "sk_neplatitel", ic_dph: "" } as any,
      {
        name: "ABRA Software s.r.o.",
        country: "CZ",
        ic_dph: "CZ25097563",
        vatStatus: "Áno",
      } as any,
      { mode: "overwrite" },
    );
    expect((r as any).vat_payer).toBe(true);
    expect((r as any).vat_scheme).toBe("cz_platce");
  });
});
