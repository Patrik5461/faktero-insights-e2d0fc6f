import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { NalezKontroly, VysledokKontroly } from "./index";
import {
  MAX_ULOZENYCH_NALEZOV,
  VERZIA_ULOZENEJ_KONTROLY,
  nacitajUlozenuKontrolu,
  najcastejsieNalezy,
  skontrolujNaUlozenie,
  stlpceKontroly,
  zhrnutieKontroly,
} from "./ulozenie";

const nalez = (o: Partial<NalezKontroly> = {}): NalezKontroly => ({
  kod: "BR-01",
  oblast: "en16931",
  zavaznost: "chyba",
  popis: "Chýba {co}.",
  parametre: { co: "číslo" },
  ...o,
});

const vysledok = (nalezy: NalezKontroly[]): VysledokKontroly => {
  const pocetChyb = nalezy.filter((n) => n.zavaznost === "chyba").length;
  return {
    platny: pocetChyb === 0,
    nalezy,
    pocetChyb,
    pocetVarovani: nalezy.length - pocetChyb,
    suhrn: null,
    pocetPravidiel: 150,
  };
};

const TERAZ = new Date("2026-10-29T10:00:00Z");

describe("stlpceKontroly", () => {
  it("uloží počty, čas a nálezy bez prázdnych polí", () => {
    const s = stlpceKontroly(
      vysledok([
        nalez({ riadok: 3, stlpec: 5, cesta: "/Invoice/cbc:ID" }),
        nalez({ kod: "PEPPOL-R1", oblast: "peppol", zavaznost: "varovanie", kategoria: "S" }),
      ]),
      TERAZ,
    );
    expect(s.kontrola_chyby).toBe(1);
    expect(s.kontrola_varovania).toBe(1);
    expect(s.skontrolovane_at).toBe("2026-10-29T10:00:00.000Z");
    expect(s.kontrola_vysledok).toEqual({
      verzia: VERZIA_ULOZENEJ_KONTROLY,
      platny: false,
      pocetChyb: 1,
      pocetVarovani: 1,
      pocetPravidiel: 150,
      orezane: 0,
      nalezy: [
        {
          kod: "BR-01",
          zavaznost: "chyba",
          oblast: "en16931",
          popis: "Chýba {co}.",
          parametre: { co: "číslo" },
          riadok: 3,
          stlpec: 5,
          cesta: "/Invoice/cbc:ID",
        },
        {
          kod: "PEPPOL-R1",
          zavaznost: "varovanie",
          oblast: "peppol",
          popis: "Chýba {co}.",
          parametre: { co: "číslo" },
          kategoria: "S",
        },
      ],
    });
    // Do jsonb musí ísť čistý JSON.
    expect(JSON.parse(JSON.stringify(s.kontrola_vysledok))).toEqual(s.kontrola_vysledok);
  });

  it("strop nálezov nezmení počty a skráti dlhé parametre", () => {
    const vela = Array.from({ length: MAX_ULOZENYCH_NALEZOV + 7 }, () =>
      nalez({ parametre: { x: "a".repeat(1000) } }),
    );
    const s = stlpceKontroly(vysledok(vela), TERAZ);
    expect(s.kontrola_chyby).toBe(MAX_ULOZENYCH_NALEZOV + 7);
    expect(s.kontrola_vysledok.nalezy).toHaveLength(MAX_ULOZENYCH_NALEZOV);
    expect(s.kontrola_vysledok.orezane).toBe(7);
    expect(String(s.kontrola_vysledok.nalezy[0].parametre.x).length).toBeLessThan(400);
  });

  it("bez nálezov je platná", () => {
    const s = stlpceKontroly(vysledok([]), TERAZ);
    expect(s.kontrola_vysledok.platny).toBe(true);
    expect(s.kontrola_chyby).toBe(0);
    expect(s.kontrola_varovania).toBe(0);
  });
});

describe("skontrolujNaUlozenie", () => {
  it("nedobre formované XML sa uloží ako chyba, príjem nepadá", () => {
    const s = skontrolujNaUlozenie("<Invoice><neuzavrete>", TERAZ, () => {});
    expect(s?.kontrola_chyby).toBe(1);
    expect(s?.kontrola_vysledok.nalezy[0].kod).toBe("FAKTERO-XML-01");
  });

  it("skutočný vzor Peppol prejde kontrolou a dá sa uložiť", () => {
    const xml = readFileSync(
      join(__dirname, "vzory-samofakturacia", "SB-base-example.xml"),
      "utf8",
    );
    const s = skontrolujNaUlozenie(xml, TERAZ, () => {});
    expect(s).not.toBeNull();
    expect(s!.kontrola_vysledok.pocetPravidiel).toBeGreaterThan(10);
    expect(s!.kontrola_chyby).toBe(
      s!.kontrola_vysledok.nalezy.filter((n) => n.zavaznost === "chyba").length,
    );
  });

  it("keď kontrola spadne, vráti null a chybu len zaloguje", () => {
    const log = vi.fn();
    // Nie text — kontrola vyhodí výnimku inú než ChybaXml.
    const s = skontrolujNaUlozenie(undefined as unknown as string, TERAZ, log);
    expect(s).toBeNull();
    expect(log).toHaveBeenCalledOnce();
  });
});

describe("nacitajUlozenuKontrolu", () => {
  it("prečíta to, čo sa uložilo", () => {
    const s = stlpceKontroly(vysledok([nalez()]), TERAZ);
    expect(nacitajUlozenuKontrolu(JSON.parse(JSON.stringify(s.kontrola_vysledok)))).toEqual(
      s.kontrola_vysledok,
    );
  });

  it("nečakaný tvar vráti null a pokazené nálezy vynechá", () => {
    expect(nacitajUlozenuKontrolu(null)).toBeNull();
    expect(nacitajUlozenuKontrolu("x")).toBeNull();
    expect(nacitajUlozenuKontrolu({ nalezy: "nie" })).toBeNull();
    const k = nacitajUlozenuKontrolu({
      nalezy: [{ kod: "BR-02", popis: "p", zavaznost: "varovanie" }, { kod: 5 }, null],
    });
    expect(k?.nalezy).toEqual([
      { kod: "BR-02", popis: "p", zavaznost: "varovanie", parametre: {} },
    ]);
    expect(k?.pocetChyb).toBe(0);
    expect(k?.pocetVarovani).toBe(1);
    expect(k?.platny).toBe(true);
  });
});

describe("zhrnutieKontroly", () => {
  it("rozlíši neskontrolované, OK, varovania a chyby", () => {
    expect(zhrnutieKontroly(null, null).stav).toBe("neskontrolovane");
    expect(zhrnutieKontroly(undefined, undefined).stav).toBe("neskontrolovane");
    expect(zhrnutieKontroly(0, 0)).toEqual({ stav: "ok", chyby: 0, varovania: 0 });
    expect(zhrnutieKontroly(0, 3)).toEqual({ stav: "varovania", chyby: 0, varovania: 3 });
    expect(zhrnutieKontroly(2, 3)).toEqual({ stav: "chyby", chyby: 2, varovania: 3 });
    expect(zhrnutieKontroly(1, null)).toEqual({ stav: "chyby", chyby: 1, varovania: 0 });
  });
});

describe("najcastejsieNalezy", () => {
  it("zoradí podľa počtu dokladov, opakovanie v jednom doklade počíta zvlášť", () => {
    const a = stlpceKontroly(vysledok([nalez(), nalez(), nalez({ kod: "BR-02" })]), TERAZ);
    const b = stlpceKontroly(vysledok([nalez({ kod: "BR-02" })]), TERAZ);
    expect(najcastejsieNalezy([a.kontrola_vysledok, b.kontrola_vysledok, null])).toEqual([
      { kod: "BR-02", zavaznost: "chyba", pocet: 2, dokladov: 2 },
      { kod: "BR-01", zavaznost: "chyba", pocet: 2, dokladov: 1 },
    ]);
  });
});
