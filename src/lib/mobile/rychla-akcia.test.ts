import { describe, expect, it } from "vitest";
import { akciaZAdresy, prijmiAdresu, vyzdvihniAkciu } from "./rychla-akcia";

describe("rýchla akcia na ikone", () => {
  it("rozozná adresu z natívnej skratky", () => {
    expect(akciaZAdresy("faktero://akcia/skener")).toBe("skener");
    expect(akciaZAdresy("faktero://akcia/skener/")).toBe("skener");
  });

  it("iné odkazy nechá na bežné presmerovanie", () => {
    expect(akciaZAdresy("faktero://faktury/123")).toBeNull();
    expect(akciaZAdresy("faktero://akcia/neznama")).toBeNull();
    expect(akciaZAdresy("https://faktero.sk/akcia/skener")).toBeNull();
    expect(akciaZAdresy("nezmysel")).toBeNull();
  });

  it("akcia sa vydá práve raz — aj keď príde skôr, než ju appka čaká", () => {
    expect(prijmiAdresu("faktero://akcia/skener")).toBe(true);
    expect(vyzdvihniAkciu()).toBe("skener");
    expect(vyzdvihniAkciu()).toBeNull();
    expect(prijmiAdresu("faktero://faktury/1")).toBe(false);
    expect(vyzdvihniAkciu()).toBeNull();
  });
});
