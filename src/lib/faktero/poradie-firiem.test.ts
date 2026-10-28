import { describe, expect, it } from "vitest";
import { pridajMedziPosledne, zoradFirmy } from "./poradie-firiem";

const mena = [
  "Delta",
  "Alfa",
  "Žilinská stavebná",
  "Beta",
  "Cyril",
  "Echo",
  "Gama",
  "Fox",
  "Hotel",
];
const firmy = mena.map((name, i) => ({ id: String(i + 1), name, ico: `1000000${i + 1}` }));
const ids = (f: { id: string }[]) => f.map((x) => x.id);

describe("poradie firiem", () => {
  it("posledné použité bez opakovania a so stropom", () => {
    expect(pridajMedziPosledne(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(pridajMedziPosledne(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });

  it("aktívna a naposledy použité hore, zvyšok abecedne", () => {
    const r = zoradFirmy(firmy, "", "3", ["5", "3", "neexistuje"]);
    expect(ids(r.posledne)).toEqual(["3", "5"]);
    expect(r.ostatne.map((f) => f.name)).toEqual([
      "Alfa",
      "Beta",
      "Delta",
      "Echo",
      "Fox",
      "Gama",
      "Hotel",
    ]);
    expect(ids(r.vsetky)).toEqual([...ids(r.posledne), ...ids(r.ostatne)]);
  });

  it("hľadanie bez diakritiky aj podľa IČO drží poradie", () => {
    expect(ids(zoradFirmy(firmy, "zilin", "1", ["3"]).vsetky)).toEqual(["3"]);
    expect(ids(zoradFirmy(firmy, "10000005", null, []).vsetky)).toEqual(["5"]);
    expect(zoradFirmy(firmy, "xyz", "1", ["1"]).vsetky).toEqual([]);
  });

  it("krátky zoznam sa nedelí, aktívna je prvá", () => {
    const male = firmy.slice(0, 3);
    const r = zoradFirmy(male, "", "3", ["1"]);
    expect(r.posledne).toEqual([]);
    expect(ids(r.vsetky)).toEqual(["3", "2", "1"]);
  });
});
