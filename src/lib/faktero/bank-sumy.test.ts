import { describe, it, expect } from "vitest";
import { spocitajPohyby } from "./bank-sumy";

describe("spocitajPohyby", () => {
  it("rozdelí pohyby na prijaté a odoslané podľa znamienka", () => {
    const s = spocitajPohyby([
      { amount: 100, currency: "EUR" },
      { amount: 250.5, currency: "EUR" },
      { amount: -80.25, currency: "EUR" },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      currency: "EUR",
      prijate: 350.5,
      odoslane: 80.25,
      pocetPrijatych: 2,
      pocetOdoslanych: 1,
      rozdiel: 270.25,
    });
  });

  it("meny nikdy nesčíta dokopy", () => {
    const s = spocitajPohyby([
      { amount: 100, currency: "EUR" },
      { amount: 5000, currency: "CZK" },
      { amount: -1000, currency: "CZK" },
    ]);
    expect(s.map((x) => x.currency).sort()).toEqual(["CZK", "EUR"]);
    expect(s.find((x) => x.currency === "CZK")).toMatchObject({ prijate: 5000, odoslane: 1000 });
    expect(s.find((x) => x.currency === "EUR")).toMatchObject({ prijate: 100, odoslane: 0 });
  });

  it("sumy z databázy chodia ako text a musia sa sčítať ako čísla", () => {
    const s = spocitajPohyby([{ amount: "1234.56" }, { amount: "-34.56" }]);
    expect(s[0].prijate).toBe(1234.56);
    expect(s[0].odoslane).toBe(34.56);
    // Bez zaokrúhlenia by tu vyšlo 1199.9999999999998.
    expect(s[0].rozdiel).toBe(1200);
  });

  it("nulové a nečitateľné riadky sa nepočítajú ani na jednu stranu", () => {
    const s = spocitajPohyby([
      { amount: 0, currency: "EUR" },
      { amount: null, currency: "EUR" },
      { amount: "—", currency: "EUR" },
      { amount: 10, currency: "EUR" },
    ]);
    expect(s[0].pocetPrijatych).toBe(1);
    expect(s[0].pocetOdoslanych).toBe(0);
  });

  it("bez pohybov nevráti nič, nie nulový riadok", () => {
    expect(spocitajPohyby([])).toEqual([]);
  });
});
