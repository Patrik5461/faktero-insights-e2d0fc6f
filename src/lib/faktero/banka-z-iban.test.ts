import { describe, expect, it } from "vitest";
import { nazovBanky } from "./banka-z-iban";

describe("nazovBanky", () => {
  it("podľa kódu v IBAN, aj keď je účet pripojený cez inú banku", () => {
    expect(nazovBanky("SK20 7500 0000 0040 3444 9488", "tatrabanka")).toBe(
      "Československá obchodná banka, a.s.",
    );
    expect(nazovBanky("SK3111000000002612345678", "tatrabanka")).toBe("Tatra banka, a.s.");
    expect(nazovBanky("CZ0420100000002600000000", "tatrabanka")).toBe("Fio banka, a.s.");
  });
  it("bez IBAN podľa poskytovateľa, inak null", () => {
    expect(nazovBanky(null, "wise")).toBe("Wise");
    expect(nazovBanky("DE89370400440532013000", null)).toBeNull();
  });
});
