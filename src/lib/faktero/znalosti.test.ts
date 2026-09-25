import { describe, expect, it } from "vitest";
import {
  MANUALY,
  bezDiakritiky,
  najdiSekcie,
  obsahManualov,
  slovaOtazky,
  znalostiKOtazke,
} from "./znalosti";

describe("znalostná báza", () => {
  it("obsahuje všetky manuály aj s obsahom", () => {
    expect(MANUALY.length).toBeGreaterThanOrEqual(30);
    expect(MANUALY.every((c) => c.sekcie.length > 0)).toBe(true);
    expect(MANUALY.every((c) => c.cesta.startsWith("/pomoc/"))).toBe(true);
  });

  it("v texte nezostali značky ani zvyšky JSX", () => {
    const vsetko = MANUALY.flatMap((c) => c.sekcie.map((s) => s.text)).join("\n");
    expect(vsetko).not.toMatch(/<\/?[a-zA-Z]/);
    expect(vsetko).not.toContain('{" "}');
    expect(vsetko).not.toMatch(/className=/);
  });

  it("odkazy si nechávajú cestu, aby asistent vedel, kam poslať", () => {
    const vsetko = MANUALY.flatMap((c) => c.sekcie.map((s) => s.text)).join("\n");
    expect(vsetko).toMatch(/\(\/[a-z-]+/);
  });
});

describe("hľadanie k otázke", () => {
  it("diakritika nerozhoduje", () => {
    expect(bezDiakritiky("Faktúra ŽIVNOSŤ")).toBe("faktura zivnost");
    expect(slovaOtazky("Ako vystavím faktúru?")).toContain("fakturu");
  });

  it("bežné slová sa zahodia", () => {
    expect(slovaOtazky("ako to je a kde sa to má")).toEqual([]);
  });

  it("nájde manuál k výkazom DPH", () => {
    const n = najdiSekcie("ako podám kontrolný výkaz", 3);
    expect(n.length).toBeGreaterThan(0);
    expect(n[0].clanok.cesta).toMatch(/dph/);
  });

  it("nájde manuál k jazdám, nie k faktúram", () => {
    const n = najdiSekcie("kniha jázd a súkromné jazdy", 3);
    expect(bezDiakritiky(n[0].clanok.titulok)).toContain("jazd");
  });

  it("otázka bez zhody nevráti nič", () => {
    expect(najdiSekcie("xyzzy plugh", 3)).toEqual([]);
  });
});

describe("text do promptu", () => {
  it("vždy nesie obsah a k tomu úryvky", () => {
    const t = znalostiKOtazke("ako overím IČ DPH odberateľa vo VIES");
    expect(t).toContain("Manuály Faktera (obsah)");
    expect(t).toContain("Úryvky z manuálov k tejto otázke");
    expect(t).toMatch(/Zdroj: \/pomoc\//);
  });

  it("obsah sám o sebe je krátky, celá báza sa neposiela", () => {
    expect(obsahManualov().length).toBeLessThan(8000);
    expect(znalostiKOtazke("faktúra").length).toBeLessThan(24000);
  });
});
