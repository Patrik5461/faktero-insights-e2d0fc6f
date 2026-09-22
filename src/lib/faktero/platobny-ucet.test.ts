import { describe, expect, it } from "vitest";
import { formatujIban, sUctomFaktury, upravIban } from "./platobny-ucet";

describe("platobný účet faktúry", () => {
  const firma = { name: "X", iban: "SK3112000000198742637541", swift: "TATRSKBX" };
  it("faktúra s vlastným účtom ho použije", () => {
    const f = sUctomFaktury(firma, { payment_iban: "SK8975000000000012345671", payment_swift: "CEKOSKBX" });
    expect(f.iban).toBe("SK8975000000000012345671");
    expect(f.swift).toBe("CEKOSKBX");
    expect(f.name).toBe("X");
  });
  it("bez účtu na faktúre ostáva účet firmy", () => {
    expect(sUctomFaktury(firma, {}).iban).toBe(firma.iban);
    expect(sUctomFaktury(firma, null).iban).toBe(firma.iban);
  });
  it("IBAN: kontrolný súčet a formát", () => {
    expect(upravIban("sk31 1200 0000 1987 4263 7541")).toBe("SK3112000000198742637541");
    expect(upravIban("SK3112000000198742637542")).toBeNull();
    expect(upravIban("abc")).toBeNull();
    expect(formatujIban("SK3112000000198742637541")).toBe("SK31 1200 0000 1987 4263 7541");
  });
});
