import { describe, expect, it } from "vitest";
import { uhradaSlovom } from "./payment-method";
import { preloz, slovnikJazyka } from "@/lib/i18n/jazyk";

const tj = (j: "sk" | "cs" | "de") => (x: string) => preloz(j, x);

describe("uhradaSlovom (Excel Dokladov)", () => {
  it("kódy bločkov aj faktúr prevedie na slovo", () => {
    const sk = tj("sk");
    expect(uhradaSlovom("hotovost", sk)).toBe("Hotovosť");
    expect(uhradaSlovom("cash", sk)).toBe("Hotovosť");
    expect(uhradaSlovom("karta", sk)).toBe("Karta");
    expect(uhradaSlovom("card", sk)).toBe("Karta");
    expect(uhradaSlovom("prevod", sk)).toBe("Bankový prevod");
    expect(uhradaSlovom("bank_transfer", sk)).toBe("Bankový prevod");
  });

  it("prázdna úhrada = prázdna bunka, neznámy kód ostane", () => {
    expect(uhradaSlovom(null, tj("sk"))).toBeNull();
    expect(uhradaSlovom("", tj("sk"))).toBeNull();
    expect(uhradaSlovom("barter", tj("sk"))).toBe("barter");
  });

  it("v CZ a DE je slovo preložené", () => {
    expect(uhradaSlovom("bank_transfer", tj("de"))).toBe("Banküberweisung");
    for (const j of ["cs", "de"] as const)
      for (const kod of ["hotovost", "karta", "prevod", "bank_transfer"]) {
        // „Karta“ je po česky rovnaká — stačí, že ju slovník pozná.
        expect(slovnikJazyka(j)[uhradaSlovom(kod, tj("sk"))!], `${kod} ${j}`).toBeDefined();
        expect(uhradaSlovom(kod, tj(j))).not.toBe(kod);
      }
  });
});
