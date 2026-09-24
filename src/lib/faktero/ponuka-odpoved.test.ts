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
