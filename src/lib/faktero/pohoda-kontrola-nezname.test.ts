import { describe, expect, it } from "vitest";
import { varovanieDokladu } from "./pohoda-kontrola";

/*
  Test 30. 10. (2. kolo): pravidlo uložilo do predkontácie názov „Nákup
  materiálu“ namiesto kódu „7“, automat podľa neho prijatú faktúru zaúčtoval
  a kontrola pred odovzdaním mlčala — Pohoda by kód pri importe nenašla.
*/
const nastavenia = {
  predkontaciePrijatych: ["7", "2", "VLASTNY"],
  zavazkovePredkontacie: ["10Gf"],
};
const prijata = (extra: Record<string, unknown> = {}) => ({
  _typPohody: "receivedInvoice",
  _povodneCislo: "FA-9",
  ...extra,
});

describe("varovanie — predkontácia mimo číselníka Pohody", () => {
  it("názov namiesto kódu sa ohlási", () => {
    const v = varovanieDokladu(prijata({ pohoda_predkontacia: "Nákup materiálu" }), nastavenia);
    expect(v).toMatch(/^FA-9 — predkontácia „Nákup materiálu“ nie je v číselníku/);
  });
  it("kód z číselníka nie", () => {
    expect(varovanieDokladu(prijata({ pohoda_predkontacia: "7" }), nastavenia)).toBeNull();
  });
  it("neznámy kód v rozúčtovaní sa ohlási, záväzkový hlási iné varovanie", () => {
    expect(
      varovanieDokladu(
        prijata({
          pohoda_predkontacia: "2",
          rozuctovanie: [{ predkontacia: "2" }, { predkontacia: "X9" }],
        }),
        nastavenia,
      ),
    ).toContain("„X9“");
    expect(
      varovanieDokladu(
        prijata({
          pohoda_predkontacia: "2",
          rozuctovanie: [{ predkontacia: "2" }, { predkontacia: "10Gf" }],
        }),
        nastavenia,
      ),
    ).toContain("Ostatné záväzky");
  });
  it("predvolená predkontácia firmy sa berie, keď doklad žiadnu nemá", () => {
    expect(varovanieDokladu(prijata(), { ...nastavenia, predkontaciaPrijata: "ZLY" })).toContain(
      "„ZLY“",
    );
    expect(varovanieDokladu(prijata(), nastavenia)).toBeNull();
  });
  it("bez načítaného číselníka sa nekontroluje", () => {
    expect(
      varovanieDokladu(prijata({ pohoda_predkontacia: "čokoľvek" }), { predkontaciePrijatych: [] }),
    ).toBeNull();
    expect(varovanieDokladu(prijata({ pohoda_predkontacia: "čokoľvek" }), null)).toBeNull();
  });
  it("bloček (bez _typPohody) nie", () => {
    expect(varovanieDokladu({ pohoda_predkontacia: "Nákup" }, nastavenia)).toBeNull();
  });
});
