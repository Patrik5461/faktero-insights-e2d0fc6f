import { describe, it, expect } from "vitest";
import {
  navratZPalivovychKariet,
  neulozeneSuboryVozidla,
  popisPaliva,
  popisSynchronizacie,
  vozidlaNaVyber,
} from "./vozidla-vyber";

describe("vozidlaNaVyber (J-06b, J-09)", () => {
  const vozidla = [
    { id: "a", active: true },
    { id: "b", active: false },
    { id: "c", active: null },
  ];
  it("vyradené vozidlá do výberu nejdú", () => {
    expect(vozidlaNaVyber(vozidla).map((v) => v.id)).toEqual(["a", "c"]);
  });
  it("práve vybrané vyradené vozidlo ostane (úprava starej jazdy)", () => {
    expect(vozidlaNaVyber(vozidla, "b").map((v) => v.id)).toEqual(["a", "b", "c"]);
  });
});

describe("popisy (J-07, J-12b)", () => {
  it("palivo ukáže popis, nie kľúč", () => {
    expect(popisPaliva("benzin")).toBe("Benzín");
    expect(popisPaliva("elektro")).toBe("Elektro");
    expect(popisPaliva(null)).toBeNull();
    expect(popisPaliva("vodik")).toBe("vodik");
  });
  it("druh synchronizácie ukáže popis", () => {
    expect(popisSynchronizacie("snapshots")).toBe("Stav vozidiel");
    expect(popisSynchronizacie("rides")).toBe("Jazdy");
    expect(popisSynchronizacie("daily")).toBe("Denná synchronizácia");
    expect(popisSynchronizacie(undefined)).toBe("—");
  });
});

describe("neulozeneSuboryVozidla (Z-12)", () => {
  it("vráti len súbory bez riadku z priečinka nove/", () => {
    expect(
      neulozeneSuboryVozidla([
        { file_path: "f1/nove/a.pdf" },
        { id: "x", file_path: "f1/v1/b.pdf" },
        { id: "y", file_path: "f1/nove/c.pdf" },
      ]),
    ).toEqual(["f1/nove/a.pdf"]);
  });
});

describe("navratZPalivovychKariet (Z-11)", () => {
  it("v Knihe jázd vedie na vozidlá", () => {
    expect(navratZPalivovychKariet("logbook")).toEqual({
      to: "/jazdy/vozidla",
      text: "Späť na vozidlá",
    });
  });
  it("vo Fakturácii a bez produktu na vozový park", () => {
    expect(navratZPalivovychKariet("invoicing").to).toBe("/vozovy-park");
    expect(navratZPalivovychKariet(null).to).toBe("/vozovy-park");
  });
});
