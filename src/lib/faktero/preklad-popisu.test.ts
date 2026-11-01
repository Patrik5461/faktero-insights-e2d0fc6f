import { describe, expect, it } from "vitest";
import { bezPrekladu, type PrekladPopisu } from "./preklad-popisu";
import { popisPravidla, type Pravidlo } from "./pravidla-uctovania";
import { NOVA_PREDLOHA, popisPredlohy } from "./predlohy-uctovania";

// Falošný „nemecký“ slovník — overí, že každý text ide cez t().
const DE: Record<string, string> = {
  'dodávateľ obsahuje „{text}"': 'Lieferant enthält „{text}"',
  "IČO {ico}": "IdNr {ico}",
  a: "und",
  "kategória {nazov}": "Kategorie {nazov}",
  "Nákup PHM": "Kraftstoffkauf",
  "predkontácia {kod}": "Vorkontierung {kod}",
  "bez odpočtu DPH": "ohne Vorsteuerabzug",
  "rozúčtovanie {pomer}": "Aufteilung {pomer}",
  "pokladňa {kod}": "Kasse {kod}",
  "rad {kod}": "Reihe {kod}",
};
const t: PrekladPopisu = (k, p) => bezPrekladu(DE[k] ?? `!${k}!`, p);

const p = (z: Partial<Pravidlo> = {}): Pravidlo => ({
  nazov: "Slovnaft",
  poradie: 10,
  aktivne: true,
  dodavatel_ico: "31322832",
  dodavatel_text: "slovnaft",
  sposob_uhrady: null,
  kategoria: "palivo",
  predkontacia: "PHM",
  clenenie_dph: null,
  odpocet: false,
  poznamka: null,
  rozuctovanie: { typ: "pomer", casti: [{ podiel: 70 }, { podiel: 30 }] },
  ...z,
});

describe("E-28: popisy pravidiel a predlôh cez t()", () => {
  it("bezPrekladu dosadí parametre", () => {
    expect(bezPrekladu("VS {vs}", { vs: 42 })).toBe("VS 42");
    expect(bezPrekladu("bez {x}")).toBe("bez {x}");
  });

  it("popisPravidla preloží všetky časti (žiadny nepreložený kľúč)", () => {
    const { ked, doplni } = popisPravidla(p(), undefined, t);
    expect(ked).toBe('IdNr 31322832 und Lieferant enthält „slovnaft"');
    expect(doplni).toBe(
      "Kategorie Kraftstoffkauf, Vorkontierung PHM, Aufteilung 70/30, ohne Vorsteuerabzug",
    );
  });

  it("bez t ostane slovenčina", () => {
    expect(popisPravidla(p()).ked).toBe('IČO 31322832 a dodávateľ obsahuje „slovnaft"');
  });

  it("popisPredlohy preloží pokladňu a rad", () => {
    const pr = { ...NOVA_PREDLOHA, nazov: "x", predkontacia: "PHMk", pokladna: "HP", rad: "26FP" };
    expect(popisPredlohy(pr, t)).toBe("PHMk / Kasse HP / Reihe 26FP");
  });
});
