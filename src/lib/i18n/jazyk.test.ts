import { describe, expect, it } from "vitest";
import {
  JAZYKY,
  jazykZCookie,
  jeJazyk,
  lokalJazyka,
  pocetPrekladov,
  preloz,
  slovnikJazyka,
} from "./jazyk";

describe("preklad webu", () => {
  it("slovenčina vráti text, nemčina preklad, chýbajúci preklad ostane po slovensky", () => {
    expect(preloz("sk", "Uložiť")).toBe("Uložiť");
    expect(preloz("de", "Uložiť")).toBe("Speichern");
    expect(preloz("de", "Text, ktorý nikto nepreložil")).toBe("Text, ktorý nikto nepreložil");
  });
  it("kľúč s kontextom: slovensky časť za ::, bez kontextového prekladu holé slovo", () => {
    expect(preloz("sk", "pozvanka::Uložiť")).toBe("Uložiť");
    expect(preloz("de", "pozvanka::Uložiť")).toBe("Speichern");
  });
  it("dosadí parametre", () => {
    expect(preloz("sk", "Spolu {n} faktúr", { n: 5 })).toBe("Spolu 5 faktúr");
  });
  it("slovníky sa načítajú zo všetkých súborov", () => {
    expect(pocetPrekladov()).toBeGreaterThan(5);
  });
});

describe("čeština (cs)", () => {
  it("je tretí jazyk webu v poradí SK, CZ, DE", () => {
    expect(JAZYKY.map((j) => j.kod)).toEqual(["sk", "cs", "de"]);
    expect(jeJazyk("cs")).toBe(true);
    expect(jeJazyk("cz")).toBe(false);
    expect(jazykZCookie("faktero_jazyk=cs")).toBe("cs");
  });
  it("locale podľa jazyka webu", () => {
    expect(lokalJazyka("sk")).toBe("sk-SK");
    expect(lokalJazyka("cs")).toBe("cs-CZ");
    expect(lokalJazyka("de")).toBe("de-DE");
    expect(lokalJazyka(undefined)).toBe("sk-SK");
  });
  it("bez českého prekladu ostane text po slovensky, s kontextom holé slovo", () => {
    const kluc = "Text, ktorý nikto nepreložil";
    expect(preloz("cs", kluc)).toBe(kluc);
    expect(preloz("cs", "pozvanka::Text, ktorý nikto nepreložil")).toBe(kluc);
    expect(preloz("cs", "Spolu {n} faktúr", { n: 5 })).not.toContain("{n}");
  });

  /*
    Slovníky `cs/*.ts` majú rovnaké kľúče ako `de/*.ts` — preklep v kľúči by
    znamenal, že text ostane po slovensky a nikto si to nevšimne. Test
    prejde aj s prázdnym priečinkom `cs/`.
  */
  const ZASTUPNE = /\{[^{}\s]+\}/g;
  const ZNACKY = /<\/?\d+\/?>/g;
  const zoznam = (s: string, re: RegExp) => (s.match(re) ?? []).sort().join(" ");
  const holy = (k: string) => (k.indexOf("::") > 0 ? k.slice(k.indexOf("::") + 2) : k);
  const CS = import.meta.glob<Record<string, string>>("./cs/*.ts", {
    eager: true,
    import: "default",
  });
  const DE = slovnikJazyka("de");
  const polozky = Object.entries(CS).flatMap(([subor, sl]) =>
    Object.entries(sl).map(([k, v]) => ({ subor: subor.slice(5), k, v })),
  );

  it("každý kľúč z cs/ existuje aj v de/", () => {
    const navyse = polozky.filter((p) => !(p.k in DE)).map((p) => `${p.subor}: ${p.k}`);
    expect(navyse).toEqual([]);
  });
  it("žiadna hodnota nie je prázdna", () => {
    const prazdne = polozky
      .filter((p) => typeof p.v !== "string" || !p.v.trim())
      .map((p) => `${p.subor}: ${p.k}`);
    expect(prazdne).toEqual([]);
  });
  it("zástupné symboly {x} ostali rovnaké ako v kľúči", () => {
    const zle = polozky
      .filter((p) => zoznam(holy(p.k), ZASTUPNE) !== zoznam(p.v, ZASTUPNE))
      .map((p) => `${p.subor}: ${p.k} → ${p.v}`);
    expect(zle).toEqual([]);
  });
  it("značky <0>…</0> ostali rovnaké ako v kľúči", () => {
    const zle = polozky
      .filter((p) => zoznam(holy(p.k), ZNACKY) !== zoznam(p.v, ZNACKY))
      .map((p) => `${p.subor}: ${p.k} → ${p.v}`);
    expect(zle).toEqual([]);
  });
});
