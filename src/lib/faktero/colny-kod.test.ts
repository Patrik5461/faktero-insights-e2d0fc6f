import { describe, expect, it } from "vitest";
import {
  colneUdajeNaZapis,
  formatColnyKod,
  jePlatnyColnyKod,
  popisColnychUdajov,
  upravColnyKod,
} from "./colny-kod";

describe("colný kód", () => {
  it("prijme bežné zápisy a odmietne nezmysel", () => {
    expect(upravColnyKod("8517.13.00")).toBe("85171300");
    expect(upravColnyKod("8517 13 00")).toBe("85171300");
    expect(upravColnyKod("851713")).toBe("851713");
    expect(upravColnyKod("12345")).toBeNull();
    expect(upravColnyKod("abc")).toBeNull();
    expect(jePlatnyColnyKod("")).toBe(true);
    expect(jePlatnyColnyKod("85x")).toBe(false);
  });
  it("formát po skupinách", () => {
    expect(formatColnyKod("85171300")).toBe("8517 13 00");
    expect(formatColnyKod("8517130000")).toBe("8517 13 00 00");
  });
  it("riadok na PDF len z vyplneného", () => {
    expect(
      popisColnychUdajov({ colny_kod: "85171300", krajina_povodu: "cn", hmotnost_kg: "0,2" }),
    ).toBe("KN 8517 13 00 · pôvod CN · hmotnosť 0,2 kg");
    expect(popisColnychUdajov({})).toBe("");
    expect(
      colneUdajeNaZapis({ colny_kod: " 8517 1300 ", krajina_povodu: "x", hmotnost_kg: "-1" }),
    ).toEqual({
      colny_kod: "85171300",
      krajina_povodu: null,
      hmotnost_kg: null,
    });
  });
});
