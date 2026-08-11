import { describe, expect, it } from "vitest";
import { mestoZAdresy, trasa, trvanieJazdy } from "./adresa-jazdy";

describe("mestoZAdresy", () => {
  it("vezme obec za PSČ", () => {
    expect(mestoZAdresy("Hlavná 26/51, 919 26 Zavar, Slovensko")).toBe("Zavar");
    expect(mestoZAdresy("919 08 Boleráz, Slovensko")).toBe("Boleráz");
    expect(mestoZAdresy("65, 345 32 Česká Kubice, Česko")).toBe("Česká Kubice");
  });

  it("zvládne PSČ bez medzery", () => {
    expect(mestoZAdresy("Športová 707/43, 91926 Zavar")).toBe("Zavar");
  });

  it("bez PSČ vezme časť bez čísla domu", () => {
    expect(mestoZAdresy("Rozbehy, Jablonica")).toBe("Rozbehy");
    expect(mestoZAdresy("Šeříková ev.6328, Znojmo")).toBe("Znojmo");
  });

  it("prázdne a nezmyselné vstupy nespadnú", () => {
    expect(mestoZAdresy(null)).toBeNull();
    expect(mestoZAdresy("")).toBeNull();
    expect(mestoZAdresy("Slovensko")).toBeNull();
  });
});

describe("trasa", () => {
  it("spojí začiatok a cieľ", () => {
    expect(trasa("919 08 Boleráz, Slovensko", "Hlavná 1, 919 26 Zavar, Slovensko")).toBe(
      "Boleráz → Zavar",
    );
  });

  it("rovnaké miesto nezopakuje", () => {
    expect(trasa("919 26 Zavar", "Hlavná 5, 919 26 Zavar")).toBe("Zavar");
  });

  it("keď chýba jedna strana, vráti druhú", () => {
    expect(trasa(null, "919 26 Zavar")).toBe("Zavar");
    expect(trasa("919 26 Zavar", null)).toBe("Zavar");
    expect(trasa(null, null)).toBeNull();
  });
});

describe("trvanieJazdy", () => {
  it("minúty aj hodiny", () => {
    expect(trvanieJazdy(2697)).toBe("45 min");
    expect(trvanieJazdy(5481)).toBe("1 h 31 min");
  });

  it("nulové a chýbajúce trvanie sa nezobrazuje", () => {
    expect(trvanieJazdy(0)).toBeNull();
    expect(trvanieJazdy(null)).toBeNull();
  });
});
