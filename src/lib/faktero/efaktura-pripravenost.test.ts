import { describe, expect, it } from "vitest";
import { stavIcDph } from "./efaktura-pripravenost";

describe("eFaktúra: IČ DPH v kontrolnom zozname (D-15)", () => {
  it("neplatiteľ IČ DPH nepotrebuje", () => {
    expect(stavIcDph({ vat_payer: false, ic_dph: null })).toBe("done");
  });
  it("platiteľ bez IČ DPH chýba, s ním je hotový", () => {
    expect(stavIcDph({ vat_payer: true, ic_dph: "" })).toBe("missing");
    expect(stavIcDph({ vat_payer: true, ic_dph: "SK2020123456" })).toBe("done");
  });
  it("bez načítanej firmy chýba", () => {
    expect(stavIcDph(null)).toBe("missing");
  });
});
