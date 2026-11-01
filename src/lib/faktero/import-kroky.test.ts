import { describe, expect, it } from "vitest";
import { krokSpatZValidacie } from "./import-kroky";

describe("krokSpatZValidacie (E-13)", () => {
  it("z „Importovať automaticky“ sa vráti na náhľad", () => {
    expect(krokSpatZValidacie(2)).toBe(2);
  });
  it("z mapovania na mapovanie", () => {
    expect(krokSpatZValidacie(3)).toBe(3);
  });
  it("bez záznamu na mapovanie", () => {
    expect(krokSpatZValidacie(null)).toBe(3);
  });
});
