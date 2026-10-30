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

  it("nemecká firma: namiesto IČO stačí Steuernummer alebo USt-IdNr.", () => {
    const f = {
      country: "DE",
      street: "Teststraße 5",
      city: "München",
      iban: "DE89370400440532013000",
    };
    expect(
      chybajuceUdajeFirmy({ ...f, dic: "143/123/45678" }, { payment_method: "bank_transfer" }),
    ).toEqual([]);
    expect(
      chybajuceUdajeFirmy({ ...f, ic_dph: "DE811907980" }, { payment_method: "bank_transfer" }),
    ).toEqual([]);
    expect(chybajuceUdajeFirmy(f, { payment_method: "bank_transfer" })).toEqual([
      "Steuernummer alebo USt-IdNr.",
    ]);
  });
});
