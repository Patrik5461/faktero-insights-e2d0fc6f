import { describe, expect, it } from "vitest";
import {
  chybaPravidla,
  naUlozenie,
  popisPravidla,
  pravidloSedi,
  prvePravidlo,
  type Pravidlo,
} from "./pravidla-uctovania";

const p = (zmeny: Partial<Pravidlo> = {}): Pravidlo => ({
  nazov: "Slovnaft",
  poradie: 10,
  aktivne: true,
  dodavatel_ico: null,
  dodavatel_text: "slovnaft",
  sposob_uhrady: null,
  kategoria: "palivo",
  predkontacia: "PHM",
  clenenie_dph: null,
  odpocet: null,
  poznamka: null,
  ...zmeny,
});

const d = (meno: string, ico: string | null = null, uhrada = "hotovost") => ({
  supplier_name: meno,
  supplier_ico: ico,
  payment_method: uhrada,
});

describe("pravidloSedi — rovnako ako v databáze", () => {
  it("názov bez ohľadu na veľkosť písmen a diakritiku", () => {
    expect(pravidloSedi(p(), d("SLOVNAFT, a.s."))).toBe(true);
    expect(pravidloSedi(p({ dodavatel_text: "Reštaurácia" }), d("RESTAURACIA U JANA"))).toBe(true);
    expect(pravidloSedi(p(), d("OMV Slovensko"))).toBe(false);
  });

  it("IČO len na číslice", () => {
    expect(
      pravidloSedi(p({ dodavatel_text: null, dodavatel_ico: "31 322 832" }), d("x", "31322832")),
    ).toBe(true);
    expect(pravidloSedi(p({ dodavatel_text: null, dodavatel_ico: "31322832" }), d("x", null))).toBe(
      false,
    );
  });

  it("všetky podmienky naraz a vypnuté pravidlo nezaberie", () => {
    const karta = p({ sposob_uhrady: "karta" });
    expect(pravidloSedi(karta, d("Slovnaft", null, "karta"))).toBe(true);
    expect(pravidloSedi(karta, d("Slovnaft", null, "hotovost"))).toBe(false);
    expect(pravidloSedi(p({ aktivne: false }), d("Slovnaft"))).toBe(false);
  });

  it("vyhrá prvé podľa poradia", () => {
    const vseobecne = p({
      nazov: "Karta",
      dodavatel_text: null,
      sposob_uhrady: "karta",
      poradie: 50,
    });
    const konkretne = p({ nazov: "Slovnaft", poradie: 10 });
    expect(prvePravidlo([vseobecne, konkretne], d("Slovnaft", null, "karta"))?.nazov).toBe(
      "Slovnaft",
    );
  });
});

describe("formulár", () => {
  it("bez podmienky alebo bez akcie neprejde", () => {
    expect(chybaPravidla(p({ dodavatel_text: " " }))).toMatch(/podmienku/);
    expect(chybaPravidla(p({ kategoria: null, predkontacia: "" }))).toMatch(/doplniť/);
    expect(chybaPravidla(p({ kategoria: null, predkontacia: null, odpocet: false }))).toBeNull();
    expect(chybaPravidla(p({ dodavatel_ico: "123" }))).toMatch(/IČO/);
  });

  it("popis na jeden riadok a uloženie bez prázdnych reťazcov", () => {
    expect(popisPravidla(p({ odpocet: false }))).toEqual({
      ked: 'dodávateľ obsahuje „slovnaft"',
      doplni: "kategória Palivo, predkontácia PHM, bez odpočtu DPH",
    });
    expect(naUlozenie(p({ dodavatel_ico: "31 322 832", poznamka: "  " }))).toMatchObject({
      dodavatel_ico: "31322832",
      poznamka: null,
    });
  });
});
