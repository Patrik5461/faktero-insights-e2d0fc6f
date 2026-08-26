import { describe, it, expect } from "vitest";
import { spd, payBySquare, textQrPlatby } from "./qr-platba";

const udaje = {
  iban: "SK03 7500 0000 0040 3280 9427",
  suma: 123.45,
  mena: "EUR",
  vs: "2026001",
  sprava: "Faktura 2026001",
  splatnost: "2026-09-09",
  prijemca: "Tobify s. r. o.",
};

describe("QR platby", () => {
  it("český SPD nesie účet, sumu aj symbol", () => {
    const s = spd(udaje);
    expect(s.startsWith("SPD*1.0*")).toBe(true);
    // IBAN bez medzier — s nimi ho banka neprečíta.
    expect(s).toContain("ACC:SK0375000000004032809427");
    expect(s).toContain("AM:123.45");
    expect(s).toContain("X-VS:2026001");
    expect(s).toContain("DT:20260909");
  });

  /*
    Toto je jadro chyby: slovenskej firme sa kreslil český formát, hoci sme
    sľubovali PAY by square. Kód vyzeral funkčne a banka ho nemusela prečítať.
  */
  it("slovenská firma dostane PAY by square, česká SPD", async () => {
    const sk = await textQrPlatby(udaje, "SK");
    expect(sk?.format).toBe("PAY by square");
    expect(sk?.text.startsWith("SPD")).toBe(false);

    const cz = await textQrPlatby(udaje, "CZ");
    expect(cz?.format).toBe("SPD");
    expect(cz?.text.startsWith("SPD*1.0*")).toBe(true);
  });

  it("PAY by square sa dá dekódovať späť na tie isté údaje", async () => {
    const text = await payBySquare(udaje);
    expect(text).toBeTruthy();
    const { decode } = await import("bysquare/pay");
    const späť: any = decode(text!);
    const p = späť.payments[0];
    expect(p.bankAccounts[0].iban).toBe("SK0375000000004032809427");
    expect(p.amount).toBe(123.45);
    expect(p.variableSymbol).toBe("2026001");
    expect(p.paymentDueDate).toBe("20260909");
  });

  /* Faktúra bez QR je stále platná faktúra — chyba nesmie zhodiť celé PDF. */
  it("nezmyselný vstup vráti null, nevyhodí výnimku", async () => {
    expect(await payBySquare({ ...udaje, iban: "nezmysel" })).toBeNull();
    expect(await textQrPlatby({ ...udaje, iban: "" }, "SK")).toBeNull();
    expect(await textQrPlatby({ ...udaje, suma: Number.NaN }, "SK")).toBeNull();
  });

  it("bez mena príjemcu sa PAY by square nezloží — doplní sa náhrada", async () => {
    const t = await textQrPlatby({ ...udaje, prijemca: null }, "SK");
    expect(t?.format).toBe("PAY by square");
  });
});
