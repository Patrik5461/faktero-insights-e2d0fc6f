import { describe, expect, it } from "vitest";
import { orHladania, zhodaHladania } from "./hladanie-zoznamu";

const doklad = {
  nazvy: ["Slovenská pošta, a.s."],
  cisla: ["FA 2026/0012", "20260012"],
  identifikatory: ["36631124", "SK2021879959"],
  sumy: [-123.45],
};

describe("zhodaHladania", () => {
  it("prázdne hľadanie prepustí všetko", () => {
    expect(zhodaHladania("", doklad)).toBe(true);
  });
  it("partner bez diakritiky a časť mena", () => {
    expect(zhodaHladania("slovenska po", doklad)).toBe(true);
    expect(zhodaHladania("orange", doklad)).toBe(false);
  });
  it("číslo dokladu bez medzier", () => {
    expect(zhodaHladania("2026/0012", doklad)).toBe(true);
    expect(zhodaHladania("0012", doklad)).toBe(true);
  });
  it("suma s desatinnou čiarkou aj bodkou, aj pri zápornej", () => {
    expect(zhodaHladania("123,45", doklad)).toBe(true);
    expect(zhodaHladania("123.45", doklad)).toBe(true);
    expect(zhodaHladania("123,46", doklad)).toBe(true);
    expect(zhodaHladania("123,50", doklad)).toBe(false);
  });
  it("IČO a IČ DPH", () => {
    expect(zhodaHladania("36631124", doklad)).toBe(true);
    expect(zhodaHladania("SK2021879959", doklad)).toBe(true);
  });
});

describe("orHladania", () => {
  it("suma ide do rozsahu stĺpca sumy", () => {
    const f = orHladania("prijate", "1 234,50")!;
    expect(f).toContain("amount_total.gte.1234.49");
    expect(f).not.toContain("invoice_number.ilike");
  });
  it("text hľadá partnera aj číslo", () => {
    const f = orHladania("vystavene", "pošta")!;
    expect(f).toContain("customer_name.imatch");
  });
  it("prázdne = null", () => {
    expect(orHladania("blocky", "  ")).toBeNull();
  });
});
