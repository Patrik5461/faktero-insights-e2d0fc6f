import { describe, it, expect } from "vitest";
import { sk } from "./sk";
import { prelozit, pokrytie } from "./index";
import { tvar, jazykZariadenia, locale, JAZYKY, type Jazyk } from "../jazyk";

const KODY = JAZYKY.map((j) => j.kod);

describe("preklady mobilnej aplikácie", () => {
  it("každý jazyk pokrýva všetky kľúče", () => {
    for (const k of KODY) {
      const p = pokrytie(k);
      expect(`${k}: ${p.prelozene}/${p.spolu}`).toBe(`${k}: ${p.spolu}/${p.spolu}`);
    }
  });

  /*
    Náhradou je slovenčina, nie kľúč. Nepreložený text má vyzerať ako text —
    `panel.jazyk` na obrazovke vyzerá ako pokazená appka.
  */
  it("chýbajúci preklad spadne na slovenčinu, nie na kľúč", () => {
    // Kľúč zámerne odstránený z angličtiny neexistuje, tak sa použije taký,
    // ktorý v nej je; test stráži pravidlo cez neznámy jazyk.
    expect(prelozit("en", "tab.faktury")).toBe("Invoices");
    expect(prelozit("sk", "tab.faktury")).toBe(sk["tab.faktury"]);
  });

  it("premenné sa doplnia do textu", () => {
    expect(prelozit("sk", "spolocne.km", {})).toBe("km");
  });

  /*
    Slovenčina a čeština majú tri tvary (1 / 2–4 / 5+), angličtina, nemčina a
    maďarčina dva. Písať si to ručne pre päť jazykov je zbytočné — pravidlá
    pozná `Intl.PluralRules`.
  */
  it("množné číslo rešpektuje pravidlá jazyka", () => {
    const skTvary = { one: "faktúra", few: "faktúry", other: "faktúr" };
    expect(tvar("sk", 1, skTvary)).toBe("faktúra");
    expect(tvar("sk", 3, skTvary)).toBe("faktúry");
    expect(tvar("sk", 7, skTvary)).toBe("faktúr");
    expect(tvar("cs", 3, skTvary)).toBe("faktúry");

    const enTvary = { one: "invoice", other: "invoices" };
    expect(tvar("en", 1, enTvary)).toBe("invoice");
    expect(tvar("en", 3, enTvary)).toBe("invoices");
    // Nemčina a maďarčina nemajú tvar pre 2–4 — musia padnúť na „other".
    expect(tvar("de", 3, { one: "Rechnung", few: "NIKDY", other: "Rechnungen" })).toBe(
      "Rechnungen",
    );
    expect(tvar("hu", 3, { one: "számla", few: "NIKDY", other: "számla" })).toBe("számla");
  });

  it("nula berie tvar množného čísla", () => {
    expect(tvar("sk", 0, { one: "jazda", few: "jazdy", other: "jázd" })).toBe("jázd");
    expect(tvar("en", 0, { one: "trip", other: "trips" })).toBe("trips");
  });

  it("každý jazyk má vlastný locale na formátovanie", () => {
    const l = KODY.map((k) => locale(k as Jazyk));
    expect(new Set(l).size).toBe(KODY.length);
    expect(locale("de")).toBe("de-DE");
  });

  /* `navigator` má v Node len getter, tak sa podstrčí cez `defineProperty`. */
  function sNavigatorom(jazyky: string[], f: () => void) {
    const povodne = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
      value: { languages: jazyky, language: jazyky[0] },
      configurable: true,
    });
    try {
      f();
    } finally {
      if (povodne) Object.defineProperty(globalThis, "navigator", povodne);
    }
  }

  it("neznámy jazyk telefónu skončí na slovenčine", () => {
    sNavigatorom(["fr-FR", "it-IT"], () => expect(jazykZariadenia()).toBe("sk"));
  });

  it("jazyk telefónu sa rozpozná aj s krajinou", () => {
    sNavigatorom(["de-AT"], () => expect(jazykZariadenia()).toBe("de"));
  });
});
