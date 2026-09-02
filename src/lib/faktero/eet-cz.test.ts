import { describe, expect, it } from "vitest";
import { jeEetQr, parseEetQr } from "./eet-cz";

/** Ukážka priamo zo špecifikácie QR EET. */
const ZO_SPECIFIKACIE = "EET*1.0*BKP:DE7AB57EF9F1B523*DIC:45316872*KC:117*DT:201710101844";

describe("jeEetQr", () => {
  it("pozná český QR podľa hlavičky", () => {
    expect(jeEetQr(ZO_SPECIFIKACIE)).toBe(true);
    expect(jeEetQr("  eet*1.0*KC:10*")).toBe(true);
  });

  it("nepomýli si ho s QR platbou ani so slovenským bločkom", () => {
    expect(jeEetQr("SPD*1.0*ACC:CZ2806000000000168540115*AM:450.00")).toBe(false);
    expect(jeEetQr("https://opd.financnasprava.sk/mdu/qr/AAAABBBB")).toBe(false);
  });
});

describe("parseEetQr", () => {
  it("prečíta doklad zo špecifikácie", () => {
    const d = parseEetQr(ZO_SPECIFIKACIE)!;
    expect(d.bkp).toBe("DE7AB57EF9F1B523");
    expect(d.dic).toBe("CZ45316872");
    expect(d.ico).toBe("45316872");
    expect(d.suma).toBe(117);
    expect(d.datum).toBe("2017-10-10");
    expect(d.cas).toBe("18:44");
    // Keď kľúč R chýba, ide o bežný režim — ale nehádame ho, v QR nebol.
    expect(d.rezim).toBeUndefined();
  });

  it("znesie predponu CZ, čiarku v sume aj režim", () => {
    const d = parseEetQr(
      "EET*1.0*FIK:0D68FDDC306C9D48*DIC:CZ00685976*KC:227,79*DT:202609021830*R:Z*",
    )!;
    expect(d.fik).toBe("0D68FDDC306C9D48");
    expect(d.dic).toBe("CZ00685976");
    expect(d.suma).toBe(227.79);
    expect(d.datum).toBe("2026-09-02");
    expect(d.rezim).toBe("zjednoduseny");
  });

  it("z desaťmiestneho DIČ fyzickej osoby neurobí IČO", () => {
    // Deväť- a desaťmiestne DIČ nesie rodné číslo; v ARES sa pod ním nič
    // nenájde a IČO z neho nie je.
    const d = parseEetQr("EET*1.0*DIC:CZ7801011234*KC:50*DT:202601021200*")!;
    expect(d.dic).toBe("CZ7801011234");
    expect(d.ico).toBeUndefined();
  });

  it("prijme aj skrátený FIK s pomlčkami a dátum bez času", () => {
    const d = parseEetQr(
      "EET*1.0*FIK:b3a09b52-7c25-4459-bd6f-3e5b0dcaa4f0*KC:1234.50*DT:20260902*",
    )!;
    expect(d.fik).toBe("B3A09B527C254459");
    expect(d.datum).toBe("2026-09-02");
    expect(d.cas).toBeUndefined();
    expect(d.suma).toBe(1234.5);
  });

  it("zahodí nezmysly a nepodstrčí prázdny doklad", () => {
    expect(parseEetQr("EET*1.0*")).toBeNull();
    expect(parseEetQr("EET*1.0*KC:mimo*DT:99999999*")).toBeNull();
    expect(parseEetQr("nejaky text")).toBeNull();
  });
});
