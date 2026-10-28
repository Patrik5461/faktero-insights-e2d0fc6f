import { describe, expect, it } from "vitest";
import { icoPrePohodu, icoZMena } from "./ico-z-mena";

describe("náhradné IČO z mena", () => {
  it("je stabilné a nezávisí od diakritiky, veľkosti písmen a medzier", () => {
    const a = icoZMena("Müller GmbH", "DE");
    expect(a).toMatch(/^FK[0-9A-F]{8}$/);
    expect(icoZMena("  MULLER  gmbh ", "de")).toBe(a);
    expect(icoZMena("Muller GmbH", "AT")).not.toBe(a);
    expect(icoZMena("Ján Novák", "SK")).not.toBe(icoZMena("Jana Nováková", "SK"));
  });

  it("zmestí sa do typ:ico (15 znakov)", () => {
    expect(icoZMena("x".repeat(500)).length).toBeLessThanOrEqual(15);
  });

  it("skutočné IČO má prednosť, bez voľby ostáva prázdne", () => {
    expect(icoPrePohodu("123 456 78", "Firma", "SK", true)).toBe("12345678");
    expect(icoPrePohodu("", "Firma", "SK", false)).toBe("");
    expect(icoPrePohodu(null, "Firma", "SK", true)).toBe(icoZMena("Firma", "SK"));
    expect(icoPrePohodu(null, "", "SK", true)).toBe("");
  });
});
