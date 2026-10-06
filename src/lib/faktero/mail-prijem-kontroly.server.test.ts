import { describe, expect, it } from "vitest";
import { cudziOdberatel, odosielatelPovoleny } from "./mail-prijem.server";

describe("povolení odosielatelia", () => {
  const p = ["fakturacia@dodavatel.sk", "@orange.sk", "slovnaft.sk"];
  it("adresa, doména so zavináčom aj bez neho", () => {
    expect(odosielatelPovoleny("Fakturácia <FAKTURACIA@dodavatel.sk>", p)).toBe(true);
    expect(odosielatelPovoleny("noreply@orange.sk", p)).toBe(true);
    expect(odosielatelPovoleny("e-faktura@slovnaft.sk", p)).toBe(true);
    expect(odosielatelPovoleny("podvod@orange.sk.zle.com", p)).toBe(false);
    expect(odosielatelPovoleny("iny@dodavatel.sk", p)).toBe(false);
  });
});

describe("doklad pre inú firmu", () => {
  const firma = { ico: "12345678", icDph: "SK2020123456" };
  it("iné IČO odberateľa je výstraha, rovnaké alebo chýbajúce nie", () => {
    expect(cudziOdberatel({ buyer_ico: "87654321" }, firma)).toMatch(/87654321/);
    expect(cudziOdberatel({ buyer_ico: "12 345 678" }, firma)).toBeNull();
    expect(cudziOdberatel({}, firma)).toBeNull();
    expect(cudziOdberatel({ buyer_ic_dph: "SK9999999999" }, firma)).toMatch(/IČ DPH/);
  });
});
