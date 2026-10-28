import { describe, expect, it } from "vitest";
import { normalizujIban, vlastnyUcetDokladu, vystavenaPodlaIban } from "./nespracovane-iban";

const ucty = [
  { iban: "SK31 1200 0000 1987 4263 7541", nazov: "Hlavný" },
  { iban: "CZ6508000000192000145399", nazov: "CZK" },
];

describe("vlastnyUcetDokladu", () => {
  it("porovná IBAN bez ohľadu na medzery a veľkosť písmen", () => {
    expect(normalizujIban(" sk31 1200-0000 ")).toBe("SK3112000000");
    expect(vlastnyUcetDokladu("sk3112000000198742637541", ucty)?.nazov).toBe("Hlavný");
    expect(vlastnyUcetDokladu("CZ65 0800 0000 1920 0014 5399", ucty)?.nazov).toBe("CZK");
  });

  it("cudzí, prázdny alebo neúplný IBAN nie je firemný", () => {
    expect(vlastnyUcetDokladu("SK8975000000000012345671", ucty)).toBeNull();
    expect(vlastnyUcetDokladu("", ucty)).toBeNull();
    expect(vlastnyUcetDokladu(null, ucty)).toBeNull();
    expect(vlastnyUcetDokladu("SK31", [{ iban: "SK31" }])).toBeNull();
  });
});

describe("vystavenaPodlaIban", () => {
  const iban = "SK3112000000198742637541";
  it("len keď je nastavenie zapnuté", () => {
    expect(
      vystavenaPodlaIban({ zapnute: false, druh: "faktura", ibanDokladu: iban, ucty }),
    ).toBeNull();
    expect(
      vystavenaPodlaIban({ zapnute: true, druh: "faktura", ibanDokladu: iban, ucty })?.nazov,
    ).toBe("Hlavný");
  });

  it("faktúra, záloha, dobropis aj neurčený druh áno — bloček a iný doklad nie", () => {
    for (const druh of ["faktura", "zalohova", "dobropis", "", null])
      expect(vystavenaPodlaIban({ zapnute: true, druh, ibanDokladu: iban, ucty })).not.toBeNull();
    for (const druh of ["blocek", "ostatny"])
      expect(vystavenaPodlaIban({ zapnute: true, druh, ibanDokladu: iban, ucty })).toBeNull();
  });
});
