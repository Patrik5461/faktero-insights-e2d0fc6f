import { describe, expect, it } from "vitest";
import {
  cisloPoziadavky,
  kategoriaSpatnejVazby,
  neprecitanaPrePodporu,
  neprecitanaPreZakaznika,
  predmetZoSpravy,
  stavPoSprave,
} from "./podpora";

const p = (z: Partial<Parameters<typeof neprecitanaPreZakaznika>[0]> = {}) => ({
  posledna_od: "podpora",
  posledna_sprava_at: "2026-10-04T10:00:00Z",
  zakaznik_videl_at: null,
  podpora_videla_at: null,
  ...z,
});

describe("help desk", () => {
  it("číslo a predmet z prvého riadku", () => {
    expect(cisloPoziadavky(1024)).toBe("P-1024");
    expect(predmetZoSpravy("\n\n  Nejde mi   PDF faktúry\nďalší riadok")).toBe("Nejde mi PDF faktúry");
    expect(predmetZoSpravy("x".repeat(100), 20)).toHaveLength(20);
    expect(predmetZoSpravy("   ")).toBe("Požiadavka bez predmetu");
  });

  it("neprečítaná odpoveď podpory pre zákazníka", () => {
    expect(neprecitanaPreZakaznika(p())).toBe(true);
    expect(neprecitanaPreZakaznika(p({ zakaznik_videl_at: "2026-10-04T11:00:00Z" }))).toBe(false);
    expect(neprecitanaPreZakaznika(p({ zakaznik_videl_at: "2026-10-04T09:00:00Z" }))).toBe(true);
    expect(neprecitanaPreZakaznika(p({ posledna_od: "zakaznik" }))).toBe(false);
  });

  it("nová správa zákazníka pre podporu", () => {
    expect(neprecitanaPrePodporu(p({ posledna_od: "zakaznik" }))).toBe(true);
    expect(
      neprecitanaPrePodporu(p({ posledna_od: "zakaznik", podpora_videla_at: "2026-10-04T12:00:00Z" })),
    ).toBe(false);
  });

  it("stav po správe — odpoveď zákazníka vráti aj vyriešenú podpore", () => {
    expect(stavPoSprave("podpora", "nova")).toBe("caka_na_zakaznika");
    expect(stavPoSprave("zakaznik", "caka_na_zakaznika")).toBe("otvorena");
    expect(stavPoSprave("zakaznik", "vyriesena")).toBe("otvorena");
    expect(stavPoSprave("zakaznik", "nova")).toBe("nova");
  });

  it("kategória spätnej väzby z appky", () => {
    expect(kategoriaSpatnejVazby("chyba", "app://diagnostika")).toBe("diagnostika");
    expect(kategoriaSpatnejVazby("napad", "https://www.faktero.sk/faktury")).toBe("napad");
    expect(kategoriaSpatnejVazby("chyba")).toBe("chyba");
  });
});
