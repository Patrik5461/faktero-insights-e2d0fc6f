import { describe, expect, it } from "vitest";
import {
  chybaPravidla,
  hladaniePravidlaZDokladu,
  krajinaDokladu,
  naUlozenie,
  ocistiPodlaDruhu,
  podobnePravidlo,
  popisPravidla,
  pravidloSedi,
  prvePravidlo,
  type Pravidlo,
} from "./pravidla-uctovania";

const p = (zmeny: Partial<Pravidlo> = {}): Pravidlo => ({
  nazov: "Telekom",
  poradie: 10,
  aktivne: true,
  dodavatel_ico: null,
  dodavatel_text: null,
  sposob_uhrady: null,
  kategoria: null,
  predkontacia: "518",
  clenenie_dph: null,
  odpocet: null,
  poznamka: null,
  ...zmeny,
});

const doklad = {
  supplier_ico: null,
  supplier_name: "Slovak Telekom, a.s.",
  payment_method: "prevod",
  druh: "prijata" as const,
  typ: "regular",
};

describe("nové podmienky pravidla — rovnako ako v databáze", () => {
  it("odosielateľ mailu obsahuje text bez ohľadu na veľkosť písmen", () => {
    const r = p({ odosielatel_text: "@telekom.sk" });
    expect(pravidloSedi(r, { ...doklad, odosielatel_mailu: "Faktury@Telekom.sk" })).toBe(true);
    expect(pravidloSedi(r, { ...doklad, odosielatel_mailu: "info@orange.sk" })).toBe(false);
    expect(pravidloSedi(r, doklad)).toBe(false);
  });

  it("krajina dodávateľa, bez nej krajina firmy", () => {
    const r = p({ krajina: "CZ" });
    expect(pravidloSedi(r, { ...doklad, krajina: "cz" })).toBe(true);
    expect(pravidloSedi(r, { ...doklad, krajina: "SK" })).toBe(false);
    expect(pravidloSedi(r, { ...doklad, krajina: null, krajina_firmy: "CZ" })).toBe(true);
    expect(pravidloSedi(r, { ...doklad, krajina: null, krajina_firmy: "SK" })).toBe(false);
  });

  it("krajina z IČ DPH, keď na doklade nie je", () => {
    expect(krajinaDokladu(null, "CZ12345678")).toBe("CZ");
    expect(krajinaDokladu("", "EL123456789")).toBe("GR");
    expect(krajinaDokladu("sk", "CZ1")).toBe("SK");
    expect(krajinaDokladu(null, "2020123456")).toBe(null);
  });

  it("stály VS — len číslice, úvodné nuly nevadia", () => {
    const r = p({ variabilny_symbol: "0012345" });
    expect(pravidloSedi(r, { ...doklad, variabilny_symbol: "12345" })).toBe(true);
    expect(pravidloSedi(r, { ...doklad, variabilny_symbol: "VS 012345" })).toBe(true);
    expect(pravidloSedi(r, { ...doklad, variabilny_symbol: "123456" })).toBe(false);
    expect(pravidloSedi(r, { ...doklad, variabilny_symbol: null })).toBe(false);
  });

  it("pravidlo podľa VS má prednosť pred pravidlom podľa predmetu", () => {
    const predmet = p({ nazov: "predmet", poradie: 1, predmet_text: "faktura" });
    const vs = p({ nazov: "vs", poradie: 50, variabilny_symbol: "777" });
    expect(
      prvePravidlo([predmet, vs], {
        ...doklad,
        predmet_mailu: "Faktura 10",
        variabilny_symbol: "777",
      })?.nazov,
    ).toBe("vs");
  });
});

describe("výstupy a kontrola", () => {
  it("pokladňa či rozúčtovanie stačí ako výsledok", () => {
    const zaklad = p({ predkontacia: null, sposob_uhrady: "hotovost" });
    expect(chybaPravidla(zaklad)).toMatch(/aspoň jednu vec/);
    expect(chybaPravidla({ ...zaklad, pokladna: "HP" })).toBeNull();
    expect(
      chybaPravidla({
        ...zaklad,
        rozuctovanie: {
          typ: "pomer",
          casti: [
            { podiel: 80, predkontacia: "A" },
            { podiel: 20, predkontacia: "B" },
          ],
        },
      }),
    ).toBeNull();
  });

  it("e-mail, krajina aj VS sú podmienky; krajina musí byť kód", () => {
    expect(chybaPravidla(p({ odosielatel_text: "x@y.sk" }))).toBeNull();
    expect(chybaPravidla(p({ krajina: "Česko" }))).toMatch(/dvojpísmenový/);
  });

  it("uloženie normalizuje", () => {
    const u = naUlozenie(
      p({ odosielatel_text: " Faktury@Telekom.SK ", krajina: "cz", variabilny_symbol: "VS 0042" }),
    );
    expect(u.odosielatel_text).toBe("faktury@telekom.sk");
    expect(u.krajina).toBe("CZ");
    expect(u.variabilny_symbol).toBe("42");
  });

  it("bloček nemá VS, prijatá nemá pokladňu, vystavená nič z toho", () => {
    const r = p({ variabilny_symbol: "1", pokladna: "HP", odosielatel_text: "a", krajina: "SK" });
    expect(ocistiPodlaDruhu({ ...r, druh: "blocek" }).variabilny_symbol).toBeNull();
    expect(ocistiPodlaDruhu({ ...r, druh: "blocek" }).pokladna).toBe("HP");
    expect(ocistiPodlaDruhu({ ...r, druh: "prijata" }).pokladna).toBeNull();
    const v = ocistiPodlaDruhu({ ...r, druh: "vystavena" });
    expect([v.variabilny_symbol, v.pokladna, v.odosielatel_text, v.krajina]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it("popis spomenie nové podmienky aj výstupy", () => {
    const { ked, doplni } = popisPravidla(
      p({
        variabilny_symbol: "42",
        krajina: "CZ",
        pokladna: "HP",
        rozuctovanie: { typ: "pomer", casti: [{ podiel: 70 }, { podiel: 30 }] },
      }),
    );
    expect(ked).toContain("VS 42");
    expect(ked).toContain("krajina CZ");
    expect(doplni).toContain("pokladňa HP");
    expect(doplni).toContain("rozúčtovanie 70/30");
  });
});

describe("pravidlo z dokladu", () => {
  const zaklad = {
    druh: "prijata" as const,
    nazov: "Slovak Telekom, a.s.",
    ico: "35763469",
    vs: "123",
    odosielatel: "f@telekom.sk",
    predkontacia: "518",
  };

  it("nájde podobné pravidlo podľa IČO, názvu či VS", () => {
    const podlaIco = { ...p({ dodavatel_ico: "35763469" }), id: "a" };
    expect(podobnePravidlo([podlaIco], zaklad)?.id).toBe("a");
    const podlaNazvu = { ...p({ dodavatel_text: "telekom" }), id: "b" };
    expect(podobnePravidlo([podlaNazvu], zaklad)?.id).toBe("b");
    const ineVs = { ...p({ variabilny_symbol: "999" }), id: "c" };
    expect(podobnePravidlo([ineVs], zaklad)).toBeNull();
    const banka = { ...p({ dodavatel_text: "telekom", druh: "banka" }), id: "d" };
    expect(podobnePravidlo([banka], zaklad)).toBeNull();
  });

  it("odkaz otvorí existujúce, inak predvyplní nové", () => {
    expect(hladaniePravidlaZDokladu(zaklad, { id: "x" })).toEqual({ upravit: "x" });
    const h = hladaniePravidlaZDokladu(zaklad);
    expect(h).toMatchObject({
      novy: "prijata",
      ico: "35763469",
      vs: "123",
      email: "f@telekom.sk",
      predkontacia: "518",
    });
    expect(hladaniePravidlaZDokladu({ ...zaklad, druh: "blocek" }).vs).toBeUndefined();
  });
});
