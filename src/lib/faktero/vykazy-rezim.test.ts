import { describe, expect, it } from "vitest";
import { druhVykazov } from "./vykazy-rezim";

describe("výkazy podľa registrácie DPH (B-19)", () => {
  it("platiteľ a neznámy režim vidia tlačivá ako doteraz", () => {
    for (const s of [
      "sk_4",
      "sk_4b",
      "sk_5",
      "cz_platce",
      "de_regel",
      "de_kleinunternehmer",
      null,
      undefined,
      "",
    ])
      expect(druhVykazov(s)).toBe("platitel");
  });
  it("neplatiteľ dostane vysvetlenie namiesto tlačív", () => {
    expect(druhVykazov("sk_neplatitel")).toBe("neplatitel");
    expect(druhVykazov("cz_neplatce")).toBe("neplatitel");
  });
  it("registrovaná osoba § 7/§ 7a a identifikovaná osoba", () => {
    expect(druhVykazov("sk_7")).toBe("registrovana");
    expect(druhVykazov("sk_7a")).toBe("registrovana");
    expect(druhVykazov("cz_identifikovana")).toBe("registrovana");
  });
});

describe("forma KH po mesiacoch (B-22)", () => {
  it("zmena formy jedného mesiaca nemení ostatné", async () => {
    const { formaKhPreMesiac } = await import("./vykazy-rezim");
    const formy = { 2: "N" as const };
    expect(formaKhPreMesiac(formy, 1)).toBe("B");
    expect(formaKhPreMesiac(formy, 2)).toBe("N");
    expect(formaKhPreMesiac(formy, 3)).toBe("B");
  });
});
