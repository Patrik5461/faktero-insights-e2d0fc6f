import { describe, expect, it } from "vitest";
import {
  bezDiakritiky,
  filtrujMoznosti,
  polozkyZoznamu,
  popisyVyberu,
  posunAktivny,
  zaciatocnyAktivny,
  type MoznostVyberu,
} from "./vyber-kodu";
import { kodyNaDoplnenie } from "./vyuctovanie-vydavkov";

const M: MoznostVyberu[] = [
  { hodnota: "1Fk", text: "Nákup PHM – karta", popis: "1Fk · 501/325" },
  { hodnota: "1Fp", text: "Služby", popis: "1Fp · 518/321" },
  { hodnota: "3Fv", text: "Tržby za služby", popis: "3Fv · 311/602" },
  { hodnota: "PD", text: "Tuzemské plnenie s odpočtom", popis: "PD" },
  { hodnota: "1F", text: "Materiál", popis: "1F · 501/321" },
];

describe("filtrujMoznosti", () => {
  it("hľadá bez ohľadu na diakritiku a veľkosť písmen", () => {
    expect(bezDiakritiky("Nákup PHM")).toBe("nakup phm");
    expect(filtrujMoznosti(M, "nakup").map((m) => m.hodnota)).toEqual(["1Fk"]);
    expect(filtrujMoznosti(M, "TRŽBY").map((m) => m.hodnota)).toEqual(["3Fv"]);
    expect(filtrujMoznosti(M, "trzby").map((m) => m.hodnota)).toEqual(["3Fv"]);
    expect(filtrujMoznosti(M, "tuzemske").map((m) => m.hodnota)).toEqual(["PD"]);
  });

  it("hľadá podľa účtov MD/D a viacerých slov", () => {
    expect(filtrujMoznosti(M, "501").map((m) => m.hodnota)).toEqual(["1Fk", "1F"]);
    expect(filtrujMoznosti(M, "518/321").map((m) => m.hodnota)).toEqual(["1Fp"]);
    expect(filtrujMoznosti(M, "phm 501").map((m) => m.hodnota)).toEqual(["1Fk"]);
    expect(filtrujMoznosti(M, "phm 602")).toEqual([]);
  });

  it("presná zhoda kódu a začiatok kódu idú navrch, inak ostane poradie", () => {
    expect(filtrujMoznosti(M, "1f").map((m) => m.hodnota)).toEqual(["1F", "1Fk", "1Fp"]);
    expect(filtrujMoznosti(M, "  ").map((m) => m.hodnota)).toEqual(M.map((m) => m.hodnota));
  });
});

describe("výber klávesnicou", () => {
  it("šípky prechádzajú dokola, Home/End na kraje, Page po ôsmich", () => {
    expect(posunAktivny(-1, "ArrowDown", 3)).toBe(0);
    expect(posunAktivny(0, "ArrowDown", 3)).toBe(1);
    expect(posunAktivny(2, "ArrowDown", 3)).toBe(0);
    expect(posunAktivny(0, "ArrowUp", 3)).toBe(2);
    expect(posunAktivny(-1, "ArrowUp", 3)).toBe(2);
    expect(posunAktivny(1, "Home", 3)).toBe(0);
    expect(posunAktivny(0, "End", 3)).toBe(2);
    expect(posunAktivny(1, "PageDown", 20)).toBe(9);
    expect(posunAktivny(18, "PageDown", 20)).toBe(19);
    expect(posunAktivny(3, "PageUp", 20)).toBe(0);
    expect(posunAktivny(0, "ArrowDown", 0)).toBe(-1);
  });

  it("zoznam má prázdnu voľbu len bez hľadania a vlastný kód len mimo číselníka", () => {
    const bez = polozkyZoznamu(M, "", { prazdne: true, vlastny: true });
    expect(bez[0]).toEqual({ druh: "prazdne", hodnota: "" });
    expect(bez).toHaveLength(M.length + 1);

    const iny = polozkyZoznamu(M, "9Xy", { prazdne: true, vlastny: true });
    expect(iny).toEqual([{ druh: "vlastny", hodnota: "9Xy" }]);

    // Presný kód z číselníka sa ako vlastný neponúkne (ani s inou veľkosťou písmen).
    const presny = polozkyZoznamu(M, "pd", { prazdne: true, vlastny: true });
    expect(presny.map((p) => p.druh)).toEqual(["moznost"]);
    expect(polozkyZoznamu(M, "9Xy", { prazdne: true })).toEqual([]);
  });

  it("po otvorení je aktívna vybraná hodnota, inak prvá voľba", () => {
    const p = polozkyZoznamu(M, "", { prazdne: true });
    expect(zaciatocnyAktivny(p, "3Fv")).toBe(3);
    expect(zaciatocnyAktivny(p, "")).toBe(0);
    expect(zaciatocnyAktivny(p, "neznamy")).toBe(0);
    expect(zaciatocnyAktivny([], "1F")).toBe(-1);
  });
});

describe("KV z vyúčtovania sa uloží na doklady", () => {
  it("doplní predkontáciu, členenie DPH aj KV, prázdne vynechá", () => {
    expect(kodyNaDoplnenie({ predkontacia: "1Fk", clenenie: "PD", kv: "B2" })).toEqual([
      ["pohoda_predkontacia", "1Fk"],
      ["pohoda_clenenie_dph", "PD"],
      ["kv_clenenie", "B2"],
    ]);
    expect(kodyNaDoplnenie({ predkontacia: null, clenenie: " ", kv: "X" })).toEqual([
      ["kv_clenenie", "X"],
    ]);
  });
});

describe("popisyVyberu", () => {
  const t = (text: string, p?: Record<string, string | number>) =>
    text.replace(/\{(\w+)\}/g, (_, k) => String(p?.[k] ?? ""));

  it("hľadanie aj zoznam nesú názov poľa", () => {
    const pk = popisyVyberu("Predkontácia", t);
    const cl = popisyVyberu("Členenie DPH", t);
    expect(pk).toEqual({
      hladanie: "Predkontácia — hľadať kód, názov alebo účet",
      zoznam: "Predkontácia — voľby",
    });
    expect(cl.hladanie).not.toBe(pk.hladanie);
    expect(cl.zoznam).not.toBe(pk.zoznam);
  });

  it("bez názvu ostanú všeobecné popisy", () => {
    expect(popisyVyberu("  ", t)).toEqual({
      hladanie: "Hľadať kód, názov alebo účet",
      zoznam: "Voľby",
    });
    expect(popisyVyberu(undefined, t).zoznam).toBe("Voľby");
  });
});
