import { describe, expect, it } from "vitest";
import { adresaRiadky } from "./adresa";

describe("adresaRiadky", () => {
  it("celá adresa má tri riadky", () => {
    expect(adresaRiadky("Športová 707/43", "919 26", "Zavar", "SK")).toEqual([
      "Športová 707/43",
      "919 26 Zavar",
      "SK",
    ]);
  });

  it("bez ulice ostane obec a krajina", () => {
    expect(adresaRiadky(null, "91926", "Zavar", "SK")).toEqual(["91926 Zavar", "SK"]);
  });

  it("odberateľ bez adresy nemá riadok — ani osamotenú krajinu", () => {
    expect(adresaRiadky(null, null, null, "SK")).toEqual([]);
    expect(adresaRiadky("", "  ", "", "SK")).toEqual([]);
  });

  it("samotné mesto bez PSČ nevyrobí medzeru navyše", () => {
    expect(adresaRiadky(null, null, "Zavar", "SK")).toEqual(["Zavar", "SK"]);
  });
});
