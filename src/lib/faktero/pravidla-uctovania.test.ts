import { describe, expect, it } from "vitest";
import {
  chybaPravidla,
  naUlozenie,
  popisPravidla,
  premennePoznamky,
  pravidloSedi,
  prvePravidlo,
  ocistiPodlaDruhu,
  pravidloPohybu,
  typPrijatej,
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
      doplni: "kategória Nákup PHM, predkontácia PHM, bez odpočtu DPH",
    });
    expect(naUlozenie(p({ dodavatel_ico: "31 322 832", poznamka: "  " }))).toMatchObject({
      dodavatel_ico: "31322832",
      poznamka: null,
    });
  });
});

describe("premenné v poznámke pravidla", () => {
  it("rovnako ako faktero_premenne_poznamky v databáze", () => {
    expect(premennePoznamky("Tel #MM-1/YYYY# | #MM/YYYY# | #MMYYYY# | #YYYY#", "2026-01-15")).toBe(
      "Tel 12/2025 | 01/2026 | 012026 | 2026",
    );
    expect(premennePoznamky("#MM-1/YYYY#", "2026-10-07")).toBe("09/2026");
  });
  it("pravidlo podľa používateľa a predmetu mailu", () => {
    const p: any = {
      nazov: "Orange", poradie: 1, aktivne: true, dodavatel_ico: null, dodavatel_text: null,
      sposob_uhrady: null, pouzivatel_id: "u1", predmet_text: "orange", kategoria: null,
      predkontacia: "TEL", clenenie_dph: null, odpocet: null, poznamka: null,
    };
    expect(pravidloSedi(p, { supplier_ico: null, supplier_name: null, payment_method: null, created_by: "u1", predmet_mailu: "Faktúra Orange 10/2026" })).toBe(true);
    expect(pravidloSedi(p, { supplier_ico: null, supplier_name: null, payment_method: null, created_by: "u2", predmet_mailu: "Orange" })).toBe(false);
    expect(chybaPravidla({ ...p, pouzivatel_id: null, predmet_text: null })).toMatch(/podmienku/);
  });
});

describe("druhy pravidiel (automatické účtovanie ako v Doklado)", () => {
  const blocek = { ...d("Slovnaft a.s."), druh: "blocek" as const };
  const prijata = { ...d("Slovnaft a.s."), druh: "prijata" as const, typ: "regular" };
  const vystavena = { ...d("Slovnaft a.s."), druh: "vystavena" as const, typ: "regular" };

  it("pôvodné pravidlo bez druhu platí na bločky aj prijaté, nie na vystavené", () => {
    expect(pravidloSedi(p(), blocek)).toBe(true);
    expect(pravidloSedi(p(), prijata)).toBe(true);
    expect(pravidloSedi(p(), vystavena)).toBe(false);
    // Doklad bez druhu je bloček, ako doteraz.
    expect(pravidloSedi(p(), d("Slovnaft a.s."))).toBe(true);
  });

  it("pravidlo s druhom platí len na ten druh; banka nikdy na doklad", () => {
    expect(pravidloSedi(p({ druh: "vystavena" }), vystavena)).toBe(true);
    expect(pravidloSedi(p({ druh: "vystavena" }), prijata)).toBe(false);
    expect(pravidloSedi(p({ druh: "prijata" }), blocek)).toBe(false);
    expect(pravidloSedi(p({ druh: "banka" }), blocek)).toBe(false);
  });

  it("typ faktúry ako podmienka", () => {
    const r = p({ druh: "prijata", typ_dokladu: "credit_note" });
    expect(pravidloSedi(r, prijata)).toBe(false);
    expect(pravidloSedi(r, { ...prijata, typ: typPrijatej("regular", -10, null) })).toBe(true);
    expect(typPrijatej("regular", 5, "FA1")).toBe("credit_note");
    expect(typPrijatej("proforma", -5, null)).toBe("proforma");
    expect(typPrijatej("regular", 5, null)).toBe("regular");
  });

  it("vystavená faktúra len s typom a KV je platné pravidlo", () => {
    expect(
      chybaPravidla(p({ druh: "vystavena", dodavatel_text: null, kategoria: null, predkontacia: null, typ_dokladu: "proforma", kv_clenenie: "X" })),
    ).toBeNull();
  });

  it("očistenie zahodí polia, ktoré druh nepozná", () => {
    const v = ocistiPodlaDruhu(p({ druh: "vystavena", sposob_uhrady: "karta", odpocet: false, bankovy_ucet: "SK1" }));
    expect(v.sposob_uhrady).toBeNull();
    expect(v.odpocet).toBeNull();
    expect(v.kategoria).toBeNull();
    expect(v.bankovy_ucet).toBeNull();
    expect(ocistiPodlaDruhu(p({ druh: null, typ_dokladu: "regular" })).typ_dokladu).toBeNull();
    expect(ocistiPodlaDruhu(p({ druh: "prijata", typ_dokladu: "debit_note" })).typ_dokladu).toBeNull();
  });
});

describe("pravidlá pre banku", () => {
  const b = (z: Partial<Pravidlo>) =>
    p({ druh: "banka", dodavatel_text: null, kategoria: null, predkontacia: "BV", ...z });
  const pohyb = { smer: "vydaj" as const, oznacenie: "dan", protistrana: "Daňový úrad", popis: "DPH 09/2026" };

  it("účet, smer, typ pohybu a protistrana", () => {
    const r = [b({ nazov: "daň", oznacenie: "dan", predkontacia: "DAN" })];
    expect(pravidloPohybu(r, pohyb, "SK00")?.predkontacia).toBe("DAN");
    expect(pravidloPohybu([b({ smer: "prijem" })], pohyb, null)).toBeNull();
    expect(pravidloPohybu([b({ bankovy_ucet: "SK31 1200 0000" })], pohyb, "sk3112000000")?.predkontacia).toBe("BV");
    expect(pravidloPohybu([b({ bankovy_ucet: "SK99" })], pohyb, "SK31")).toBeNull();
    expect(pravidloPohybu([b({ dodavatel_text: "danovy urad" })], pohyb, null)).not.toBeNull();
    expect(pravidloPohybu([b({ dodavatel_text: "09/2026" })], pohyb, null)).not.toBeNull();
  });

  it("bez podmienky ani predkontácie sa neuplatní; menšie poradie vyhráva", () => {
    expect(pravidloPohybu([b({})], pohyb, null)).toBeNull();
    expect(pravidloPohybu([b({ smer: "vydaj", predkontacia: null })], pohyb, null)).toBeNull();
    const r = [b({ smer: "vydaj", poradie: 20, predkontacia: "A" }), b({ oznacenie: "dan", poradie: 5, predkontacia: "B" })];
    expect(pravidloPohybu(r, pohyb, null)?.predkontacia).toBe("B");
    expect(chybaPravidla(b({}))).toMatch(/aspoň jednu podmienku/);
    expect(chybaPravidla(b({ smer: "vydaj", predkontacia: null }))).toMatch(/predkontáciu/);
  });
});
