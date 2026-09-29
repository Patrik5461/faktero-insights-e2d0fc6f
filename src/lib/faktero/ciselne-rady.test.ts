import { describe, it, expect } from "vitest";
import {
  chybaSablony,
  druhPodlaTypuFaktury,
  resetujeSaMesacne,
  ukazkaCisla,
} from "./ciselne-rady";

describe("kontrola šablóny", () => {
  it("prepustí bežné tvary", () => {
    expect(chybaSablony("{YYYY}{NNNN}")).toBeNull();
    expect(chybaSablony("ZF{YYYY}{NNNN}")).toBeNull();
    expect(chybaSablony("FA-{YY}{MM}-{NNN}")).toBeNull();
  });
  it("bez poradia to nedáva zmysel", () => {
    expect(chybaSablony("{YYYY}")).toMatch(/poradie/);
    expect(chybaSablony("FA2026")).toMatch(/poradie/);
  });
  it("prázdnu, pridlhú, s medzerou ani s neznámym tokenom nepustí", () => {
    expect(chybaSablony("")).toMatch(/prázdna/);
    expect(chybaSablony("A".repeat(41) + "{NNNN}")).toMatch(/pridlhá/);
    expect(chybaSablony("FA {YYYY}{NNNN}")).toMatch(/medzery/);
    expect(chybaSablony("{ROK}{NNNN}")).toMatch(/neznámy token/);
  });
});

describe("ukážka čísla", () => {
  const den = new Date(2026, 2, 5); // 5. marca 2026

  it("doplní rok, mesiac a poradie", () => {
    expect(ukazkaCisla("{YYYY}{NNNN}", 1, den)).toBe("20260001");
    expect(ukazkaCisla("ZF{YYYY}{NNNN}", 7, den)).toBe("ZF20260007");
    expect(ukazkaCisla("FA-{YY}{MM}-{NNN}", 12, den)).toBe("FA-2603-012");
  });
  it("počet N určuje počet číslic", () => {
    expect(ukazkaCisla("{YYYY}{NN}", 3, den)).toBe("202603");
    expect(ukazkaCisla("{YYYY}{NNNNN}", 3, den)).toBe("202600003");
  });
  it("poradie dlhšie než šablóna sa neoreže", () => {
    expect(ukazkaCisla("{YYYY}{NN}", 1234, den)).toBe("20261234");
  });
  it("prázdna šablóna vráti prázdno", () => {
    expect(ukazkaCisla("", 1, den)).toBe("");
  });
});

describe("reset poradia a druh radu", () => {
  it("mesiac v šablóne znamená mesačný reset", () => {
    expect(resetujeSaMesacne("{YYYY}{MM}{NNN}")).toBe(true);
    expect(resetujeSaMesacne("{YYYY}{NNNN}")).toBe(false);
  });
  it("typ faktúry vyberá svoj rad", () => {
    expect(druhPodlaTypuFaktury("regular")).toBe("invoice");
    expect(druhPodlaTypuFaktury("proforma")).toBe("proforma");
    expect(druhPodlaTypuFaktury("credit_note")).toBe("credit_note");
    expect(druhPodlaTypuFaktury("advance_payment")).toBe("advance_payment");
    expect(druhPodlaTypuFaktury(null)).toBe("invoice");
  });
});
