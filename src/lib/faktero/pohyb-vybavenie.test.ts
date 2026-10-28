import { describe, expect, it } from "vitest";
import {
  hladaniePravidlaZPohybu,
  jeTransakcnaDan,
  pokrytiePohybu,
  pravidloBezDokladu,
  stavPohybu,
} from "./pohyb-vybavenie";
import {
  chybaPravidla,
  naUlozenie,
  ocistiPodlaDruhu,
  pravidloPohybu,
  type Pravidlo,
} from "./pravidla-uctovania";
import { odhadniOznacenie } from "./vypis-oznacenie";

const b = (x: Partial<Pravidlo>): Pravidlo => ({
  nazov: "x",
  poradie: 100,
  aktivne: true,
  dodavatel_ico: null,
  dodavatel_text: null,
  sposob_uhrady: null,
  kategoria: null,
  predkontacia: null,
  clenenie_dph: null,
  odpocet: null,
  poznamka: null,
  druh: "banka",
  bez_dokladu: true,
  ...x,
});

describe("transakčná daň", () => {
  it("spozná popisy z Tatra banky", () => {
    expect(jeTransakcnaDan("Transakčná daň 30.09.2026")).toBe(true);
    expect(jeTransakcnaDan("Transakčná daň za transakcie")).toBe(true);
    expect(jeTransakcnaDan("TRANSAKCNA DAN ZA POUZITIE KARTY")).toBe(true);
    expect(jeTransakcnaDan("Financial transaction tax")).toBe(true);
    expect(jeTransakcnaDan(null, "Transakčná daň")).toBe(true);
  });
  it("nepomýli si iné poplatky ani daň", () => {
    expect(jeTransakcnaDan("Miesto: Transakcny poplatok")).toBe(false);
    expect(jeTransakcnaDan("Daň z príjmu 2025")).toBe(false);
    expect(jeTransakcnaDan("Úhrada faktúry 2026001")).toBe(false);
  });
  it("má vlastné označenie platby pred daňou", () => {
    expect(odhadniOznacenie({ popis: "Transakčná daň 31.07.2026", smer: "vydaj" })).toBe(
      "transakcna_dan",
    );
    expect(odhadniOznacenie({ popis: "Daňový úrad Bratislava", smer: "vydaj" })).toBe("dan");
  });
});

describe("pravidlo Spárované bez dokladu", () => {
  const pohyb = {
    suma: -350.2,
    protiucet: "SK12 0900 0000 0000 1234 5678",
    vs: "0012345",
    protistrana: "Sociálna poisťovňa",
    popis: "Odvody 09/2026",
  };
  it("sedí podľa IBAN-u, VS a smeru", () => {
    expect(
      pravidloBezDokladu([b({ iban_protistrany: "sk1209000000000012345678" })], pohyb, null),
    ).not.toBeNull();
    expect(pravidloBezDokladu([b({ variabilny_symbol: "12345" })], pohyb, null)).not.toBeNull();
    expect(pravidloBezDokladu([b({ variabilny_symbol: "999" })], pohyb, null)).toBeNull();
    expect(
      pravidloBezDokladu([b({ dodavatel_text: "socialna", smer: "prijem" })], pohyb, null),
    ).toBeNull();
    expect(
      pravidloBezDokladu([b({ dodavatel_text: "socialna", smer: "vydaj" })], pohyb, null),
    ).not.toBeNull();
  });
  it("bez protistrany, IBAN-u či VS nezaberie (len účet a smer by vybavili všetko)", () => {
    expect(
      pravidloBezDokladu([b({ smer: "vydaj", bankovy_ucet: "SK31" })], pohyb, "SK31"),
    ).toBeNull();
  });
  it("pravidlo s typom pohybu alebo bez výsledku bez dokladu nezaberie", () => {
    expect(
      pravidloBezDokladu([b({ dodavatel_text: "socialna", oznacenie: "dan" })], pohyb, null),
    ).toBeNull();
    expect(
      pravidloBezDokladu([b({ dodavatel_text: "socialna", bez_dokladu: false })], pohyb, null),
    ).toBeNull();
  });
  it("menšie poradie vyhráva, pri rovnakom viac podmienok", () => {
    const r = [
      b({ id: "a", dodavatel_text: "socialna" }),
      b({ id: "b", dodavatel_text: "socialna", variabilny_symbol: "12345" }),
    ];
    expect(pravidloBezDokladu(r, pohyb, null)?.id).toBe("b");
    expect(pravidloBezDokladu([{ ...r[0], poradie: 5 }, r[1]], pohyb, null)?.id).toBe("a");
  });
  it("vo výpise do Pohody dá predkontáciu aj podľa IBAN-u a VS", () => {
    const r = [
      b({ bez_dokladu: false, predkontacia: "ODV", iban_protistrany: "SK1209000000000012345678" }),
    ];
    expect(
      pravidloPohybu(r, { smer: "vydaj", protiucet: pohyb.protiucet, vs: pohyb.vs }, null)
        ?.predkontacia,
    ).toBe("ODV");
    expect(pravidloPohybu(r, { smer: "vydaj", protiucet: "SK99" }, null)).toBeNull();
  });
});

describe("kontrola a uloženie pravidla pre banku", () => {
  it("bez dokladu nepotrebuje predkontáciu, ale potrebuje protistranu, IBAN alebo VS", () => {
    expect(chybaPravidla(b({ variabilny_symbol: "1" }))).toBeNull();
    expect(chybaPravidla(b({ smer: "vydaj" }))).toMatch(/IBAN protistrany, VS alebo protistranu/);
    expect(chybaPravidla(b({ dodavatel_text: "x", oznacenie: "dan" }))).toMatch(/typ pohybu/);
    expect(chybaPravidla(b({ bez_dokladu: false, smer: "vydaj" }))).toMatch(/predkontáciu/);
  });
  it("uloží IBAN bez medzier a poznámku k pohybu ponechá", () => {
    const u = naUlozenie(
      ocistiPodlaDruhu(
        b({ iban_protistrany: "sk12 0900 0000", poznamka: "Odvody", variabilny_symbol: "007" }),
      ),
    );
    expect(u.iban_protistrany).toBe("SK1209000000");
    expect(u.poznamka).toBe("Odvody");
    expect(u.variabilny_symbol).toBe("7");
    expect(u.bez_dokladu).toBe(true);
  });
  it("iný druh pravidla bankové podmienky zahodí", () => {
    const u = naUlozenie(
      ocistiPodlaDruhu(b({ druh: "prijata", iban_protistrany: "SK12", dodavatel_text: "x" })),
    );
    expect(u.iban_protistrany).toBeNull();
    expect(u.bez_dokladu).toBe(false);
  });
});

describe("stav a pokrytie pohybu", () => {
  it("rozlíši spárovaný, vybavený a nespárovaný", () => {
    expect(stavPohybu({ matched_expense_id: "x" })).toBe("sparovany");
    expect(stavPohybu({ vybavenie: "transakcna_dan" })).toBe("transakcna_dan");
    expect(stavPohybu({ vybavenie: "bez_dokladu" })).toBe("bez_dokladu");
    expect(stavPohybu({})).toBe("nesparovany");
  });
  it("Spolu X z Y v absolútnych hodnotách", () => {
    expect(pokrytiePohybu(-98.4, [{ suma: 60 }, { suma: 38.4 }])).toEqual({
      spolu: 98.4,
      z: 98.4,
      zostava: 0,
      uplne: true,
    });
    expect(pokrytiePohybu(100, [{ suma: 40 }]).zostava).toBe(60);
  });
  it("predvyplní pravidlo z pohybu", () => {
    expect(
      hladaniePravidlaZPohybu({
        suma: -5,
        protistrana: "Tatra banka",
        protiucet: "SK12 0900 0000 0000 1234 5678",
        vs: "0042",
      }),
    ).toEqual({
      novy: "banka",
      nazov: "Tatra banka",
      smer: "vydaj",
      iban: "SK1209000000000012345678",
      bvs: "42",
      protistrana: undefined,
    });
    expect(hladaniePravidlaZPohybu({ suma: 10, protistrana: "Poplatok" }).protistrana).toBe(
      "Poplatok",
    );
  });
});
