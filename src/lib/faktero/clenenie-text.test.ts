import { describe, expect, it } from "vitest";
import { textClenenia, textZauctovania } from "./clenenie-text";

describe("textClenenia", () => {
  it("spojí členenie DPH a KV", () => {
    expect(textClenenia("PD", "B2")).toBe("PD · B2");
  });
  it("chýbajúca časť vypadne", () => {
    expect(textClenenia("PD", null)).toBe("PD");
    expect(textClenenia("", " B2 ")).toBe("B2");
    expect(textClenenia(null, undefined)).toBe("");
  });
  it("s predkontáciou", () => {
    expect(textZauctovania("501/321", "PD", "B2")).toBe("501/321 · PD · B2");
    expect(textZauctovania("", "PD", "")).toBe("PD");
  });
});
