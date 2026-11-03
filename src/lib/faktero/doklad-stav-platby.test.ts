import { describe, expect, it } from "vitest";
import { odkazNaPohyb, pohybZNavrhu, stavPlatbyDokladu } from "./doklad-stav-platby";

const k = { maUcet: true, hladaneOd: "2026-09-01" };
const uhrada = { datum: "2026-10-02", transactionId: "t1" };
const navrh = { transactionId: "t2", expenseId: "e1", istota: "auto" as const, dovody: [] };

describe("stavPlatbyDokladu", () => {
  it("hotovosť a karta sú bez ikonky, aj keď majú pohyb", () => {
    expect(stavPlatbyDokladu({ payment_method: "hotovost", issue_date: "2026-10-01" }, { ...k, uhrada })).toBeNull();
    expect(stavPlatbyDokladu({ payment_method: "karta", issue_date: "2026-10-01" }, { ...k, uhrada })).toBeNull();
    expect(stavPlatbyDokladu({ payment_method: "karta", issue_date: "2026-10-01" }, { ...k, navrh })).toBeNull();
    expect(stavPlatbyDokladu({ payment_method: null, issue_date: "2026-10-01" }, k)).toBeNull();
  });
  it("prevod: spárovaná / návrh / nenájdená", () => {
    const r = { payment_method: "prevod", issue_date: "2026-10-01" };
    expect(stavPlatbyDokladu(r, { ...k, uhrada })).toBe("sparovana");
    expect(stavPlatbyDokladu(r, { ...k, navrh })).toBe("navrh");
    expect(stavPlatbyDokladu(r, k)).toBe("nenajdena");
  });
  it("nenájdená len keď sa hľadalo — firma s účtom a doklad v okne", () => {
    expect(stavPlatbyDokladu({ payment_method: "prevod", issue_date: "2026-10-01" }, { ...k, maUcet: false })).toBeNull();
    expect(stavPlatbyDokladu({ payment_method: "prevod", issue_date: "2026-05-01" }, k)).toBeNull();
    expect(stavPlatbyDokladu({ payment_method: "prevod", issue_date: null }, k)).toBeNull();
    // Spárovaný starý doklad ikonku má — väzba sa dá pozrieť aj zrušiť.
    expect(stavPlatbyDokladu({ payment_method: "prevod", issue_date: "2026-05-01" }, { ...k, uhrada })).toBe("sparovana");
  });
});

describe("pohyb do okienka", () => {
  it("odkaz vedie na pohyby účtu", () => {
    expect(odkazNaPohyb("abc")).toBe("/bankove-ucty/transakcie?account=abc");
    expect(odkazNaPohyb(null)).toBe("/bankove-ucty/transakcie");
  });
  it("suma z návrhu je číslo", () => {
    expect(
      pohybZNavrhu({ ...navrh, pohyb: { booking_date: "2026-10-03", amount: "-12.5", currency: "EUR", bank_account_id: "u1" } }),
    ).toMatchObject({ datum: "2026-10-03", suma: -12.5, mena: "EUR", odkaz: "/bankove-ucty/transakcie?account=u1" });
  });
});
