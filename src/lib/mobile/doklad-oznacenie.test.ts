import { describe, expect, it } from "vitest";
import {
  akciePohybu,
  odoberStitok,
  pridajStitok,
  splatnostKluc,
  stitokPohybu,
  sumaZPolicka,
} from "./doklad-oznacenie";
import { OPERACIE, OPERACIE_BEZ_PRIHLASENIA, jeOperacia } from "./operacie";
import { sk } from "./preklady/sk";

describe("štítky dokladu v appke", () => {
  it("pridá orezaný štítok a nezdvojí ho ani s inou veľkosťou písmen", () => {
    expect(pridajStitok([], "  auto  BA-123 ")).toEqual(["auto BA-123"]);
    expect(pridajStitok(["Projekt X"], "projekt x")).toBeNull();
    expect(pridajStitok([], "   ")).toBeNull();
  });

  it("drží strop 5 štítkov a 40 znakov", () => {
    expect(pridajStitok(["a", "b", "c", "d", "e"], "f")).toBeNull();
    expect(pridajStitok([], "x".repeat(60))![0]).toHaveLength(40);
  });

  it("odobratie nechá ostatné", () => {
    expect(odoberStitok(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("označenie pohybu bez dokladu", () => {
  it("spárovaný pohyb sa neoznačuje", () => {
    expect(akciePohybu("sparovany")).toEqual([]);
  });

  it("nespárovaný ponúkne obe označenia, označený druhé a zrušenie", () => {
    expect(akciePohybu("nesparovany")).toEqual(["bez_dokladu", "transakcna_dan"]);
    expect(akciePohybu(undefined)).toEqual(["bez_dokladu", "transakcna_dan"]);
    expect(akciePohybu("bez_dokladu")).toEqual(["transakcna_dan", null]);
    expect(akciePohybu("transakcna_dan")).toEqual(["bez_dokladu", null]);
  });

  it("štítok v zozname má len spárovaný a označený pohyb", () => {
    expect(stitokPohybu("nesparovany")).toBeNull();
    expect(stitokPohybu("sparovany")?.kluc).toBe("banka.sparovane");
    expect(stitokPohybu("transakcna_dan")?.kluc).toBe("banka.transakcnaDan");
    // Kľúče musia existovať v slovníku, inak by sa na obrazovke ukázal kľúč.
    for (const s of ["sparovany", "bez_dokladu", "transakcna_dan"] as const)
      expect(sk[stitokPohybu(s)!.kluc]).toBeTruthy();
  });
});

describe("úhrada prijatej faktúry v appke", () => {
  it("suma z políčka prijme čiarku aj medzery", () => {
    expect(sumaZPolicka("12,50")).toBe(12.5);
    expect(sumaZPolicka("1 200,555")).toBe(1200.56);
    expect(sumaZPolicka("12.5")).toBe(12.5);
    expect(sumaZPolicka("")).toBe(0);
    expect(sumaZPolicka("-3")).toBe(0);
    expect(sumaZPolicka("abc")).toBe(0);
  });

  it("splatnosť: po, dnes, o koľko dní", () => {
    expect(splatnostKluc(null)).toBeNull();
    expect(splatnostKluc(3)).toEqual({ kluc: "pf.poSplatnosti", n: 3 });
    expect(splatnostKluc(0)).toEqual({ kluc: "pf.splatnaDnes", n: 0 });
    expect(splatnostKluc(-2)).toEqual({ kluc: "pf.doSplatnosti", n: 2 });
  });
});

describe("operácie appky", () => {
  it("kľúče sú jedinečné a dajú sa použiť v adrese", () => {
    expect(new Set(OPERACIE).size).toBe(OPERACIE.length);
    for (const k of OPERACIE) expect(k).toMatch(/^[a-z0-9-]+$/);
  });

  it("označenie pohybu ide cez most a vyžaduje prihlásenie", () => {
    expect(jeOperacia("pohyb-oznac")).toBe(true);
    expect(OPERACIE_BEZ_PRIHLASENIA).not.toContain("pohyb-oznac");
    // QR prihlásenie musí ísť bez tokenu — človek ešte prihlásený nie je.
    expect(OPERACIE_BEZ_PRIHLASENIA).toContain("parovanie-vymen");
  });
});
