import { describe, expect, it } from "vitest";
import { varovanieDokladu } from "./pohoda-kontrola";
import { zavazkoveKody } from "./uctovanie-agenda";

const nastavenia = {
  zavazkovePredkontacie: zavazkoveKody([
    { kod: "LEAS", agenda: "commitment" },
    { kod: "2", agenda: "commitment" },
    { kod: "2", agenda: "receivedInvoice" },
    { kod: "1Pr", agenda: "receivedInvoice" },
  ]),
};
const prijata = (rozuctovanie: any[], extra: Record<string, unknown> = {}) => ({
  _typPohody: "receivedInvoice",
  _povodneCislo: "FA-7",
  rozuctovanie,
  ...extra,
});

describe("varovanie — záväzkový kód v rozúčtovaní prijatej faktúry", () => {
  it("riadok s kódom len z Ostatných záväzkov sa ohlási", () => {
    const v = varovanieDokladu(
      prijata([{ predkontacia: "1Pr" }, { predkontacia: "LEAS" }]),
      nastavenia,
    );
    expect(v).toMatch(/^FA-7 — /);
    expect(v).toContain("„LEAS“");
    expect(v).toContain("Ostatné záväzky");
  });

  it("kód, ktorý je aj v prijatých faktúrach, nie", () => {
    expect(varovanieDokladu(prijata([{ predkontacia: "2" }]), nastavenia)).toBeNull();
  });

  it("hlavička so záväzkovým kódom — celý doklad ide ako záväzok, bez varovania", () => {
    expect(
      varovanieDokladu(
        prijata([{ predkontacia: "LEAS" }], { pohoda_predkontacia: "LEAS" }),
        nastavenia,
      ),
    ).toBeNull();
  });

  it("bez rozúčtovania, bločky a firma bez záväzkových kódov — nič", () => {
    expect(varovanieDokladu(prijata([]), nastavenia)).toBeNull();
    expect(varovanieDokladu({ rozuctovanie: [{ predkontacia: "LEAS" }] }, nastavenia)).toBeNull();
    expect(varovanieDokladu(prijata([{ predkontacia: "LEAS" }]), {})).toBeNull();
  });
});
