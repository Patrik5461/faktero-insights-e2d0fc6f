import { describe, expect, it } from "vitest";
import { chybajuceUdajeFirmy } from "./udaje-firmy-na-fakture";

describe("chybajuceUdajeFirmy", () => {
  it("nová firma bez nastavení: chýba IČO, adresa aj IBAN", () => {
    expect(
      chybajuceUdajeFirmy(
        { ico: null, street: "", city: null, iban: null },
        { payment_method: "bank_transfer" },
      ),
    ).toEqual(["IČO", "adresa", "IBAN"]);
  });
  it("IBAN z vybraného účtu faktúry stačí", () => {
    expect(
      chybajuceUdajeFirmy(
        { ico: "12345678", street: "Hlavná 1", city: "Nitra", iban: null },
        { payment_method: "bank_transfer", payment_iban: "SK3112000000198742637541" },
      ),
    ).toEqual([]);
  });
  it("pri hotovosti IBAN netreba", () => {
    expect(
      chybajuceUdajeFirmy(
        { ico: "1", street: "a", city: "b", iban: "" },
        { payment_method: "cash" },
      ),
    ).toEqual([]);
  });
  it("bez firmy nič nehlási", () => {
    expect(chybajuceUdajeFirmy(null, { payment_method: "bank_transfer" })).toEqual([]);
  });
});
