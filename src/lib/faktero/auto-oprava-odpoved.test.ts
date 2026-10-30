import { describe, expect, it } from "vitest";
import {
  navrhOdpovede,
  obsahujeTajomstvo,
  ocistiZhrnutie,
  smieOdpovedat,
  textOdpovede,
  zhrnutieZoZmeny,
} from "./auto-oprava-odpoved";

describe("ocistiZhrnutie", () => {
  it("vyhodí oslovenie, podpis, cesty, kód a commity", () => {
    const t = ocistiZhrnutie(
      "Dobrý deň,\nv zozname dokladov (src/routes/_authenticated/doklady.index.tsx) sa ikona `onClick` už otvorí v náhľade. Commit 4e6f7f58 na vetve oprava/P-1008-1.\n\nS pozdravom\nTím Faktero",
    );
    expect(t).toBe("v zozname dokladov sa ikona už otvorí v náhľade. Commit na vetve.");
  });

  it("nechá odkaz na faktero.sk, cudzí vyhodí", () => {
    expect(
      ocistiZhrnutie("Pozrite https://www.faktero.sk/pomoc a https://evil.example/x tu."),
    ).toBe("Pozrite https://www.faktero.sk/pomoc a tu.");
  });

  it("dlhé skráti na celú vetu, prázdne vráti null", () => {
    const dlhe = "Toto je veta o oprave. ".repeat(80);
    const t = ocistiZhrnutie(dlhe)!;
    expect(t.length).toBeLessThanOrEqual(900);
    expect(t.endsWith(".")).toBe(true);
    expect(ocistiZhrnutie("  ")).toBeNull();
    expect(ocistiZhrnutie(null)).toBeNull();
  });
});

describe("navrhOdpovede a textOdpovede", () => {
  it("poskladá text s číslom, predmetom a zhrnutím", () => {
    const t = navrhOdpovede({
      cislo: 1008,
      predmet: "VS sa nedoplní",
      zhrnutie: "VS sa doplní samo.",
    });
    expect(t).toContain("P-1008");
    expect(t).toContain("(„VS sa nedoplní“)");
    expect(t).toContain("\n\nVS sa doplní samo.\n\n");
    expect(t.startsWith("Dobrý deň,")).toBe(true);
  });

  it("bez zhrnutia ostane len šablóna", () => {
    const t = navrhOdpovede({ cislo: 1001, predmet: "", zhrnutie: null });
    expect(t).toContain("v požiadavke P-1001, sme opravili");
  });

  it("text podpory má prednosť, inak zhrnutie, inak „Návrh odpovede“ zo zmeny", () => {
    expect(textOdpovede({ cislo: 1, predmet: "x", odpoved_text: "  Vlastný text " })).toBe(
      "Vlastný text",
    );
    expect(
      textOdpovede({
        cislo: 1,
        predmet: "x",
        zmena: "Zmenil som X.\n\nNávrh odpovede: Už to ide.",
      }),
    ).toContain("Už to ide.");
    expect(zhrnutieZoZmeny("bez návrhu")).toBeNull();
  });
});

describe("obsahujeTajomstvo", () => {
  it("zachytí dlhú hodnotu, krátke ignoruje", () => {
    expect(obsahujeTajomstvo("kľúč re_ABCDEFGHIJKLMNOP123 tu", ["re_ABCDEFGHIJKLMNOP123"])).toBe(
      true,
    );
    expect(obsahujeTajomstvo("port 3000", ["3000", undefined])).toBe(false);
  });
});

describe("smieOdpovedat", () => {
  const teraz = Date.parse("2026-10-30T10:00:00Z");
  const zaklad = {
    stav: "nasadena",
    odpoved_auto: true,
    odpoved_odoslana_at: null,
    nasadena_at: "2026-10-30T09:58:00Z",
  };
  it("nasadená, zapnutá, čerstvá → smie", () => {
    expect(smieOdpovedat(zaklad, "caka_na_zakaznika", teraz)).toBeNull();
  });
  it("dôvody, prečo nie", () => {
    expect(smieOdpovedat({ ...zaklad, stav: "zlucena" }, "nova", teraz)).toBe("nie_je_nasadena");
    expect(smieOdpovedat({ ...zaklad, odpoved_auto: false }, "nova", teraz)).toBe("vypnuta");
    expect(
      smieOdpovedat({ ...zaklad, odpoved_odoslana_at: "2026-10-30T09:59:00Z" }, "nova", teraz),
    ).toBe("uz_odoslana");
    expect(smieOdpovedat({ ...zaklad, nasadena_at: "2026-10-27T09:00:00Z" }, "nova", teraz)).toBe(
      "pozde",
    );
    expect(smieOdpovedat({ ...zaklad, nasadena_at: null }, "nova", teraz)).toBe("pozde");
    expect(smieOdpovedat(zaklad, "vyriesena", teraz)).toBe("poziadavka_uzavreta");
  });
});
