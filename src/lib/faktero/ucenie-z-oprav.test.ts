import { describe, expect, it } from "vitest";
import { prazdneUdaje } from "./nespracovane";
import {
  bezNaucenychPodPravidlom,
  doplnNaucene,
  druhPrijatej,
  klucDodavatela,
  navrhPola,
  poliaPravidla,
  pridajVolby,
  staleNaucene,
  volbyZUdajov,
  zmeneneNaucene,
  type Volba,
} from "./ucenie-z-oprav";

const v = (...h: string[]): Volba[] =>
  h.map((x, i) => ({ h: x, t: `2026-10-0${i + 1}T00:00:00Z` }));

describe("klucDodavatela", () => {
  it("IČO má prednosť, len číslice a krátke doplní nulami", () => {
    expect(klucDodavatela({ ico: "36 123 456", icDph: "SK2020", nazov: "X" })).toBe("ico:36123456");
    expect(klucDodavatela({ ico: "123456" })).toBe("ico:00123456");
  });
  it("bez IČO IČ DPH, inak názov bez diakritiky a právnej formy", () => {
    expect(klucDodavatela({ ico: "", icDph: "sk 2020123456" })).toBe("dph:SK2020123456");
    expect(klucDodavatela({ nazov: "Slovnaft, a.s." })).toBe("nazov:slovnaft");
    expect(klucDodavatela({ nazov: "ŠTARK s.r.o." })).toBe(
      klucDodavatela({ nazov: "Stark  spol. s r. o." }),
    );
    expect(klucDodavatela({ nazov: " " })).toBeNull();
  });
});

describe("navrhPola", () => {
  it("najčastejšia hodnota s aspoň 2 výskytmi", () => {
    expect(navrhPola(v("A", "B", "A", "C"))).toBe("A");
    expect(navrhPola(v("A", "B"))).toBeNull();
    expect(navrhPola(v("A"))).toBeNull();
    expect(navrhPola([])).toBeNull();
  });
  it("oprava potvrdená dvakrát za sebou prebije starú históriu", () => {
    expect(navrhPola(v("A", "A", "A", "B", "B"))).toBe("B");
    expect(navrhPola(v("A", "A", "A", "B"))).toBe("A");
  });
  it("pri zhode vyhrá novšia", () => {
    expect(navrhPola(v("A", "B", "A", "B", "C"))).toBe("B");
  });
  it("prázdna voľba nič nenavrhne", () => {
    expect(navrhPola(v("A", "", ""))).toBeNull();
  });
});

describe("doplnNaucene", () => {
  const polia = {
    predkontacia: v("1Fp", "1Fp"),
    clenenie: v("PD", "PD"),
    kategoria: v("phm", "phm"),
    stredisko: v("BA", "KE"),
    platba: v("karta", "karta"),
    zakazka: v("job-1", "job-1"),
  };
  it("dopĺňa len prázdne polia a zapíše, čo doplnil", () => {
    const u = prazdneUdaje();
    u.kody.clenenie = "PN";
    const out = doplnNaucene(u, "faktura", polia, { platneZakazky: new Set(["job-1"]) });
    expect(out.kody.predkontacia).toBe("1Fp");
    expect(out.kody.clenenie).toBe("PN");
    expect(out.kody.stredisko).toBe("");
    expect(out.kategoria).toBe("phm");
    expect(out.jobId).toBe("job-1");
    // Faktúra sa platí prevodom — spôsob úhrady sa učí len pri bločku.
    expect(out.platba).toBe("");
    expect(out.naucene).toEqual({ predkontacia: "1Fp", kategoria: "phm", zakazka: "job-1" });
    expect(u.kody.predkontacia).toBe("");
  });
  it("pri bločku doplní spôsob úhrady", () => {
    expect(doplnNaucene(prazdneUdaje(), "blocek", polia).platba).toBe("karta");
  });
  it("polia ručného pravidla a zatvorená zákazka sa nedopĺňajú", () => {
    const out = doplnNaucene(prazdneUdaje(), "faktura", polia, {
      chranene: poliaPravidla({
        kategoria: null,
        predkontacia: "2Fp",
        clenenie_dph: "",
        kv_clenenie: null,
      }),
      platneZakazky: new Set(),
    });
    expect(out.kody.predkontacia).toBe("");
    expect(out.kody.clenenie).toBe("PD");
    expect(out.jobId).toBe("");
  });
  it("bez návykov vráti údaje bez zmeny", () => {
    const u = prazdneUdaje();
    expect(doplnNaucene(u, "faktura", null)).toBe(u);
    expect(doplnNaucene(u, "faktura", {})).toBe(u);
  });
});

describe("naučené po zásahu človeka", () => {
  it("zmenené pole už nie je naučené a pri ďalšom čítaní sa nedopĺňa", () => {
    const u = doplnNaucene(prazdneUdaje(), "faktura", {
      predkontacia: v("1Fp", "1Fp"),
      kategoria: v("phm", "phm"),
    });
    const zmenene = { ...u, kody: { ...u.kody, predkontacia: "" } };
    expect(staleNaucene(zmenene)).toEqual(["kategoria"]);
    expect(zmeneneNaucene(zmenene)).toEqual(["predkontacia"]);
    const znova = doplnNaucene(
      zmenene,
      "faktura",
      { predkontacia: v("1Fp", "1Fp") },
      { chranene: zmeneneNaucene(zmenene) },
    );
    expect(znova.kody.predkontacia).toBe("");
  });
  it("pred zápisom vyprázdni naučené hodnoty v poliach pravidla, ručné nechá", () => {
    const u = doplnNaucene(prazdneUdaje(), "faktura", {
      predkontacia: v("1Fp", "1Fp"),
      kategoria: v("phm", "phm"),
    });
    u.kody.clenenie = "PD";
    const out = bezNaucenychPodPravidlom(u, ["predkontacia", "clenenie"]);
    expect(out.kody.predkontacia).toBe("");
    expect(out.kody.clenenie).toBe("PD");
    expect(out.kategoria).toBe("phm");
  });
});

describe("pridajVolby", () => {
  it("pridá na koniec, drží najviac 10 a oprava toho istého dokladu nahradí voľbu", () => {
    let p = pridajVolby(null, { predkontacia: "1Fp", kategoria: "phm" }, "t1", "d1");
    p = pridajVolby(p, { predkontacia: "2Fp" }, "t2", "d1");
    expect(p.predkontacia).toEqual([{ h: "2Fp", t: "t2", d: "d1" }]);
    expect(p.kategoria).toEqual([{ h: "phm", t: "t1", d: "d1" }]);
    for (let i = 0; i < 12; i++) p = pridajVolby(p, { predkontacia: `K${i}` }, `t${i}`, `x${i}`);
    expect(p.predkontacia).toHaveLength(10);
    expect(p.predkontacia!.at(-1)!.h).toBe("K11");
  });
  it("voľby z formulára — platba len pri bločku, prázdne sa zapíšu ako prázdne", () => {
    const u = prazdneUdaje();
    u.platba = "karta";
    u.kody.predkontacia = " 1Fp ";
    expect(volbyZUdajov(u, "faktura")).not.toHaveProperty("platba");
    expect(volbyZUdajov(u, "blocek")).toMatchObject({
      platba: "karta",
      predkontacia: "1Fp",
      clenenie: "",
    });
  });
});

describe("druhPrijatej", () => {
  it("rozozná zálohovú a dobropis", () => {
    expect(druhPrijatej({ type: "proforma" })).toBe("zalohova");
    expect(druhPrijatej({ type: "regular", amount_total: -10 })).toBe("dobropis");
    expect(druhPrijatej({ type: "regular", opravuje_cislo: "F1" })).toBe("dobropis");
    expect(druhPrijatej({ type: "regular", amount_total: 10 })).toBe("faktura");
  });
});
