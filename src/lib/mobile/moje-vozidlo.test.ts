import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mojeVozidlo, zapamatajVozidlo, vozidloPreRozpoznanuJazdu } from "./moje-vozidlo";

// Testy bežia v Node, kde localStorage nie je. Stačí najjednoduchšia náhrada —
// modul od nej nič viac nechce.
beforeAll(() => {
  const data = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
});

const FIRMA = "11111111-1111-1111-1111-111111111111";
const INA = "22222222-2222-2222-2222-222222222222";
const AUTO_A = "aaaa1111-0000-0000-0000-000000000000";
const AUTO_B = "bbbb2222-0000-0000-0000-000000000000";

describe("moje vozidlo v telefóne", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("zapamätá a vráti voľbu pre danú firmu", () => {
    zapamatajVozidlo(FIRMA, AUTO_A);
    expect(mojeVozidlo(FIRMA)).toBe(AUTO_A);
    // Iná firma má vlastnú voľbu, nemiešajú sa.
    expect(mojeVozidlo(INA)).toBeNull();
  });

  it("voľba sa dá zrušiť", () => {
    zapamatajVozidlo(FIRMA, AUTO_A);
    zapamatajVozidlo(FIRMA, null);
    expect(mojeVozidlo(FIRMA)).toBeNull();
  });
});

describe("do ktorého auta uložiť rozpoznanú jazdu", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("pri jedinom aute netreba nič pamätať", () => {
    expect(vozidloPreRozpoznanuJazdu({ companyId: FIRMA, dostupne: [AUTO_A] })).toBe(AUTO_A);
  });

  it("pri viacerých autách rozhodne zapamätané", () => {
    zapamatajVozidlo(FIRMA, AUTO_B);
    expect(vozidloPreRozpoznanuJazdu({ companyId: FIRMA, dostupne: [AUTO_A, AUTO_B] })).toBe(
      AUTO_B,
    );
  });

  it("bez zapamätaného auta sa musí spýtať človeka", () => {
    expect(vozidloPreRozpoznanuJazdu({ companyId: FIRMA, dostupne: [AUTO_A, AUTO_B] })).toBeNull();
  });

  it("zapamätané auto, ktoré už firma nemá, sa nepoužije", () => {
    zapamatajVozidlo(FIRMA, "cccc3333-0000-0000-0000-000000000000");
    expect(vozidloPreRozpoznanuJazdu({ companyId: FIRMA, dostupne: [AUTO_A, AUTO_B] })).toBeNull();
  });
});
