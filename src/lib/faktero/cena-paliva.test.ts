import { describe, it, expect } from "vitest";
import { cenaZoZaznamov } from "./cena-paliva";

describe("cenaZoZaznamov", () => {
  it("vezme prvú použiteľnú cenu", () => {
    expect(cenaZoZaznamov([{ price_per_liter: 1.529 }, { price_per_liter: 1.6 }])).toBe(1.529);
  });

  // Tankovanie bez ceny alebo s nulou je v databáze bežné (dopočítava sa
  // z celkovej sumy). Nula by sa tvárila ako vyplnená a náklad na jazdu by
  // vyšiel nula — presne to, čo má táto funkcia odstrániť.
  it("preskočí prázdne a nulové ceny", () => {
    expect(
      cenaZoZaznamov([{ price_per_liter: null }, { price_per_liter: 0 }, { price_per_liter: 1.7 }]),
    ).toBe(1.7);
  });

  it("bez záznamov vráti null, nie nulu", () => {
    expect(cenaZoZaznamov([])).toBeNull();
    expect(cenaZoZaznamov(null)).toBeNull();
    expect(cenaZoZaznamov([{ price_per_liter: "nezmysel" }])).toBeNull();
  });
});
