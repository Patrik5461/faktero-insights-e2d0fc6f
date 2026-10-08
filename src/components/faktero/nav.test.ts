import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { NAV, INVOICING_KEYS, LOGBOOK_KEYS, filterNav } from "./nav";

/**
 * Trasy, ktoré router naozaj pozná. Berú sa z vygenerovaného stromu, nie
 * z ručného zoznamu — ten by sa rozišiel pri prvom premenovaní stránky.
 */
const TRASY = new Set(
  [...readFileSync("src/routeTree.gen.ts", "utf-8").matchAll(/fullPath: '([^']+)'/g)].map(
    (m) => m[1],
  ),
);

const polozky = NAV.flatMap((g) => g.children.map((c) => ({ ...c, skupina: g.key })));

describe("bočná lišta", () => {
  it("vygenerovaný strom trás sa dá prečítať", () => {
    /* Keby sa formát `routeTree.gen.ts` zmenil, zvyšné testy by ticho prešli. */
    expect(TRASY.size).toBeGreaterThan(50);
    expect(TRASY.has("/exporty")).toBe(true);
  });

  it("každá položka vedie na existujúcu trasu", () => {
    /* Zoznam agendy má v strome lomku na konci (`/doklady/`), v menu nie. */
    const mrtve = polozky.filter((p) => !TRASY.has(p.to) && !TRASY.has(p.to + "/"));
    expect(mrtve.map((p) => `${p.skupina}: ${p.label} → ${p.to}`)).toEqual([]);
  });

  /*
   * `to: "/faktury?type=credit"` je tichá chyba — router reťazec neprečíta
   * a položka neurobí nič. Parametre patria do `search`.
   */
  it("parametre adresy sú v `search`, nie v `to`", () => {
    const zle = polozky.filter((p) => p.to.includes("?"));
    expect(zle.map((p) => `${p.label} → ${p.to}`)).toEqual([]);
  });

  /*
   * Skupina bez kľúča sa z lišty vytratí, aj keď má položky aj trasy —
   * takto boli Zákazky istý čas neviditeľné.
   */
  it("každá skupina má kľúč v jednej z dvoch množín", () => {
    const bezKluca = NAV.filter(
      (g) => !INVOICING_KEYS.has(g.key) && !LOGBOOK_KEYS.has(g.key) && g.key !== "viac",
    );
    expect(bezKluca.map((g) => g.label)).toEqual([]);
  });

  it("kľúč bez skupiny nikoho neprepustí", () => {
    const kluce = new Set(NAV.map((g) => g.key));
    const siroty = [...INVOICING_KEYS, ...LOGBOOK_KEYS].filter((k) => !kluce.has(k));
    expect(siroty).toEqual([]);
  });

  it("žiadne dve položky v skupine nemajú rovnaký popis", () => {
    for (const g of NAV) {
      const popisy = g.children.map((c) => c.label);
      expect(new Set(popisy).size, `skupina ${g.key}`).toBe(popisy.length);
    }
  });

  it("skupina sa zvýrazní podľa `match`, tak musí sedieť s cestami detí", () => {
    /*
      Položka môže viesť aj do inej sekcie (Doklady → Prijaté faktúry, ako
      v Doklado) — vtedy sa zvýrazní tá skupina, ktorej cesta patrí. Stačí,
      aby ju niektorá skupina poznala; inak by sa nezvýraznilo nič.
    */
    for (const g of NAV) {
      for (const c of g.children) {
        const sedi = NAV.some((gg) => gg.match.some((m) => c.to === m || c.to.startsWith(m + "/")));
        expect(sedi, `${g.key}: ${c.to} nespadá pod žiadnu skupinu`).toBe(true);
      }
    }
  });
});

describe("účtovníctvo", () => {
  const uctovnictvo = NAV.find((g) => g.key === "uctovnictvo")!;
  const popisy = uctovnictvo.children.map((c) => c.label);

  it("importy sú jedna položka, nie stránka na každý program", () => {
    expect(popisy).toContain("Účtovné importy");
    expect(popisy.filter((l) => l.startsWith("Import z")).length).toBe(0);
    /* Samostatná skupina na importy tu už nemá čo robiť. */
    expect(NAV.some((g) => g.key === "uctovne-importy")).toBe(false);
  });

  it("importy stoja vedľa exportov a obe majú svoju históriu", () => {
    expect(popisy).toContain("Účtovné exporty");
    expect(popisy).toContain("História exportov");
    expect(popisy).toContain("História importov");
  });
});

describe("filterNav", () => {
  it("do knihy jázd nepustí fakturačné skupiny a naopak", () => {
    const jazdy = filterNav("logbook", true).map((g) => g.key);
    expect(jazdy).toContain("jazdy");
    expect(jazdy).not.toContain("uctovnictvo");

    const fakturacia = filterNav("invoicing", true).map((g) => g.key);
    expect(fakturacia).toContain("uctovnictvo");
    expect(fakturacia).not.toContain("jazdy");
  });

  /* eKasa aj eFaktúra sú slovenské evidencie — českej firme by len naschvál. */
  it("českej firme skryje pokladňu a eFaktúru", () => {
    const cesty = (k: "SK" | "CZ") =>
      filterNav("invoicing", true, k).flatMap((g) => g.children.map((c) => c.to));
    expect(cesty("SK")).toContain("/pokladna");
    expect(cesty("CZ")).not.toContain("/pokladna");
    expect(cesty("CZ").some((c) => c.startsWith("/efaktura"))).toBe(false);
  });

  it("prázdna skupina z lišty vypadne", () => {
    for (const g of filterNav("invoicing", false, "CZ")) {
      expect(g.children.length, g.key).toBeGreaterThan(0);
    }
  });
});
