import { describe, expect, it } from "vitest";
import {
  cakaNaMna,
  cestaNaDoklad,
  najnovsie,
  nicNecaka,
  odkazNaDoklad,
  poleProPostgrest,
  popisDokladu,
  spoluUloh,
  stavCitania,
  zmenVyriesenie,
} from "./moje-ulohy";

describe("komentár čakajúci na mňa", () => {
  const k = { user_id: "autor", upozornit: ["jana", "peter"], vyriesili: [] as string[] };

  it("čaká na označeného, kým ho nevyrieši", () => {
    expect(cakaNaMna(k, "jana")).toBe(true);
    expect(cakaNaMna({ ...k, vyriesili: ["jana"] }, "jana")).toBe(false);
  });

  it("vyriešenie jedného označeného neberie úlohu druhému", () => {
    expect(cakaNaMna({ ...k, vyriesili: ["jana"] }, "peter")).toBe(true);
  });

  it("neoznačený ani autor ho medzi úlohami nemajú", () => {
    expect(cakaNaMna(k, "niekto")).toBe(false);
    expect(cakaNaMna({ ...k, upozornit: ["autor"] }, "autor")).toBe(false);
    expect(cakaNaMna(k, "")).toBe(false);
  });

  it("zvládne prázdne polia z databázy", () => {
    expect(cakaNaMna({ user_id: "a", upozornit: null, vyriesili: null }, "jana")).toBe(false);
    expect(cakaNaMna({ user_id: "a", upozornit: ["jana"], vyriesili: null }, "jana")).toBe(true);
  });
});

describe("zmena vyriešenia", () => {
  it("pridá len seba a bez duplicít", () => {
    expect(zmenVyriesenie(["peter"], "jana", true)).toEqual(["peter", "jana"]);
    expect(zmenVyriesenie(["jana"], "jana", true)).toEqual(["jana"]);
    expect(zmenVyriesenie(null, "jana", true)).toEqual(["jana"]);
  });

  it("vrátenie medzi úlohy odoberie len seba", () => {
    expect(zmenVyriesenie(["peter", "jana"], "jana", false)).toEqual(["peter"]);
    expect(zmenVyriesenie([], "jana", false)).toEqual([]);
  });

  it("pole pre PostgREST má zložené zátvorky", () => {
    expect(poleProPostgrest([])).toBe("{}");
    expect(poleProPostgrest(["a", "b"])).toBe("{a,b}");
  });
});

describe("počty", () => {
  it("spočíta všetky tri sekcie", () => {
    expect(spoluUloh({ schvalenie: 2, komentare: 1, nespracovane: 4 })).toBe(7);
    expect(nicNecaka({ schvalenie: 0, komentare: 0, nespracovane: 0 })).toBe(true);
    expect(nicNecaka({ schvalenie: 0, komentare: 1, nespracovane: 0 })).toBe(false);
  });

  it("záporné číslo (chyba počtu) nič neodpočíta", () => {
    expect(spoluUloh({ schvalenie: -1, komentare: 2, nespracovane: 0 })).toBe(2);
  });
});

describe("odkaz na doklad", () => {
  it("bloček ide cez `search`, faktúry cez parameter", () => {
    expect(odkazNaDoklad("doklad", "x")).toEqual({ to: "/doklady/novy", search: { id: "x" } });
    expect(odkazNaDoklad("prijata", "x")).toEqual({
      to: "/prijate-faktury/$id",
      params: { id: "x" },
    });
    expect(odkazNaDoklad("vystavena", "x")).toEqual({ to: "/faktury/$id", params: { id: "x" } });
  });

  it("zvonček dostane tú istú cestu ako reťazec", () => {
    expect(cestaNaDoklad("doklad", "x")).toBe("/doklady/novy?id=x");
    expect(cestaNaDoklad("prijata", "x")).toBe("/prijate-faktury/x");
    expect(cestaNaDoklad("vystavena", "x")).toBe("/faktury/x");
  });

  it("popis dokladu", () => {
    expect(popisDokladu("prijata", "2026015", "Orange")).toBe("Prijatá faktúra 2026015 · Orange");
    expect(popisDokladu("doklad", null, null)).toBe("Bloček / doklad bez čísla");
  });
});

describe("nespracované", () => {
  it("stav čítania slovami", () => {
    expect(stavCitania("cita").ton).toBe("cita");
    expect(stavCitania("chyba").text).toBe("Doplniť ručne");
    expect(stavCitania("vytazene").ton).toBe("ok");
    expect(stavCitania(undefined).ton).toBe("ok");
  });

  it("najnovšie z dvoch zoznamov, najviac n", () => {
    const a = [
      { id: "a1", vytvorene: "2026-10-01T10:00:00Z" },
      { id: "a2", vytvorene: "2026-10-03T10:00:00Z" },
    ];
    const b = [{ id: "b1", vytvorene: "2026-10-02T10:00:00Z" }];
    expect(najnovsie([a, b], 2).map((x) => x.id)).toEqual(["a2", "b1"]);
    expect(najnovsie([[], []])).toEqual([]);
  });
});
