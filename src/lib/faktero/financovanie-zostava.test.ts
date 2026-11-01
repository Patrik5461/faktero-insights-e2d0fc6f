import { describe, expect, it } from "vitest";
import { zostavaPodlaMien } from "./financovanie-zostava";

describe("Zostáva splatiť (B-01)", () => {
  it("sčíta po menách, bez kontokorentu a ukončených zmlúv", () => {
    const m = zostavaPodlaMien([
      { kind: "kontokorent", status: "active", currency: "CZK", zostavaSuma: 999 },
      { kind: "leasing", status: "active", currency: "EUR", zostavaSuma: 1000 },
      { kind: "uver", status: "active", currency: "CZK", zostavaSuma: 50000 },
      { kind: "leasing", status: "active", currency: "EUR", zostavaSuma: 250.5 },
      { kind: "leasing", status: "closed", currency: "EUR", zostavaSuma: 7 },
    ]);
    expect([...m.entries()]).toEqual([
      ["EUR", 1250.5],
      ["CZK", 50000],
    ]);
  });
  it("bez aktívnych leasingov a úverov je prázdne", () => {
    expect(
      zostavaPodlaMien([{ kind: "kontokorent", status: "active", currency: "EUR", zostavaSuma: 5 }])
        .size,
    ).toBe(0);
  });
});

describe("mena zmluvy (B-02)", () => {
  it("nový leasing CZ firmy je v CZK, úprava drží uloženú menu", async () => {
    const { menaZmluvy } = await import("./financovanie-zostava");
    expect(menaZmluvy({ kontokorent: false, domaca: "CZK" })).toBe("CZK");
    expect(menaZmluvy({ kontokorent: false, ulozena: "CZK", domaca: "EUR" })).toBe("CZK");
    expect(menaZmluvy({ kontokorent: false, volba: "EUR", ulozena: "CZK", domaca: "CZK" })).toBe(
      "EUR",
    );
    expect(menaZmluvy({ kontokorent: true, menaUctu: "CZK", ulozena: "EUR", domaca: "EUR" })).toBe(
      "CZK",
    );
  });
});
