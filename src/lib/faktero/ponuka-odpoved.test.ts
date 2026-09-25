import { describe, expect, it } from "vitest";
import { prekazkaOdpovede, stavPoOdpovedi, upravDovod } from "./ponuka-odpoved";

const dnes = "2026-09-24";

describe("kedy sa dá na ponuku odpovedať", () => {
  it("odoslaná ponuka v platnosti sa dá prijať", () => {
    expect(prekazkaOdpovede({ stav: "sent", platiDo: "2026-10-01" }, dnes)).toBeNull();
    // Bez dátumu platnosti nič neobmedzuje.
    expect(prekazkaOdpovede({ stav: "sent" }, dnes)).toBeNull();
    // Posledný deň platnosti ešte platí.
    expect(prekazkaOdpovede({ stav: "sent", platiDo: dnes }, dnes)).toBeNull();
  });

  it("po uplynutí platnosti sa odpovedať nedá", () => {
    expect(prekazkaOdpovede({ stav: "sent", platiDo: "2026-09-23" }, dnes)?.kod).toBe("vyprsala");
  });

  it("druhé kliknutie prvú odpoveď neprepíše", () => {
    expect(prekazkaOdpovede({ stav: "accepted" }, dnes)?.kod).toBe("uz_vybavena");
    expect(prekazkaOdpovede({ stav: "rejected" }, dnes)?.kod).toBe("uz_vybavena");
  });

  it("koncept a už premenená ponuka sú mimo hry", () => {
    expect(prekazkaOdpovede({ stav: "draft" }, dnes)?.kod).toBe("koncept");
    expect(prekazkaOdpovede({ stav: "converted" }, dnes)?.kod).toBe("premenena");
  });

  it("expirovaná ponuka sa dá ešte prijať, kým je v platnosti podľa dátumu", () => {
    // Stav „expired" nastavuje nočný beh podľa dátumu; keď dátum ešte platí,
    // rozhoduje dátum, nie stav.
    expect(prekazkaOdpovede({ stav: "expired", platiDo: "2026-10-01" }, dnes)).toBeNull();
  });
});

describe("odpoveď", () => {
  it("prijatie a zamietnutie majú svoj stav", () => {
    expect(stavPoOdpovedi("prijat")).toBe("accepted");
    expect(stavPoOdpovedi("zamietnut")).toBe("rejected");
  });

  it("prázdny dôvod sa neukladá, dlhý sa oreže", () => {
    expect(upravDovod("   ")).toBeNull();
    expect(upravDovod("draho")).toBe("draho");
    expect(upravDovod("x".repeat(3000))?.length).toBe(2000);
  });
});

describe("karta s tlačidlami v e-maile", () => {
  it("nesie číslo, sumu, platnosť aj obidva odkazy", async () => {
    const { tlacidlaDoMailu } = await import("./ponuka-odpoved.server");
    const html = tlacidlaDoMailu({
      token: "t".repeat(64),
      cislo: "2026/UK-2",
      suma: 553.5,
      mena: "EUR",
      platiDo: "2026-10-08",
    });
    expect(html).toContain("2026/UK-2");
    expect(html).toContain("553,50 EUR");
    expect(html).toContain("Platí do 8. 10. 2026");
    expect(html).toContain("?odpoved=prijat");
    expect(html).toContain("?odpoved=zamietnut");
    // Poštoví klienti flex nevedia — layout musí stáť na tabuľke.
    expect(html).toContain("<table");
    expect(html).not.toContain("display:flex");
  });

  it("staršie volanie so samotným tokenom funguje ďalej", async () => {
    const { tlacidlaDoMailu } = await import("./ponuka-odpoved.server");
    expect(tlacidlaDoMailu("x".repeat(64), "2026-10-08")).toContain("Platí do 8. 10. 2026");
  });
});
