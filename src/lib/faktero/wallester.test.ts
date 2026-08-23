import { describe, it, expect } from "vitest";
import {
  oknoPohybov,
  pohybyZWallesteru,
  pohybZWallesteru,
  sumaPohybu,
  ucetZWallesteru,
} from "./wallester";

describe("kartové účty Wallesteru", () => {
  it("berie disponibilnú sumu a mena robí meno účtu", () => {
    expect(
      ucetZWallesteru({
        id: "acc-1",
        name: null,
        currency_code: "EUR",
        available_amount: 812.4,
        balance: 900,
      }),
    ).toEqual({
      external_account_id: "acc-1",
      iban: null,
      account_name: "Wallester EUR",
      currency: "EUR",
      // Nie 900 — o rozdiel sú blokácie, ktorými sa platiť nedá.
      balance: 812.4,
    });
  });

  it("pomenovaný účet si meno nechá", () => {
    expect(
      ucetZWallesteru({ id: "a", name: "Karty obchod", currency_code: "EUR" }).account_name,
    ).toBe("Karty obchod");
  });
});

describe("znamienko sumy", () => {
  it("nákup a výber uberajú, vklad a vrátenie pridávajú", () => {
    expect(sumaPohybu({ group: "Purchase", account_amount: 45.9 })).toBe(-45.9);
    expect(sumaPohybu({ group: "InternetPurchase", account_amount: -45.9 })).toBe(-45.9);
    expect(sumaPohybu({ group: "Withdraw", account_amount: 100 })).toBe(-100);
    expect(sumaPohybu({ group: "Deposit", account_amount: -250 })).toBe(250);
    expect(sumaPohybu({ group: "Refund", account_amount: 12.5 })).toBe(12.5);
  });

  it("pri neznámom druhu sa znamienko nevymýšľa", () => {
    // „Other" môže byť poplatok aj pripísanie — tipovať by znamenalo kaziť súčty.
    expect(sumaPohybu({ group: "Other", account_amount: -3.2 })).toBe(-3.2);
    expect(sumaPohybu({ group: "Other", account_amount: 3.2 })).toBe(3.2);
  });

  it("bez sumy nie je pohyb", () => {
    expect(sumaPohybu({ group: "Purchase" })).toBeNull();
  });
});

describe("pohyby", () => {
  const nakup = {
    id: "tx-1",
    group: "Purchase",
    account_amount: 45.9,
    account_currency_code: "EUR",
    merchant_name: "SLOVNAFT",
    merchant_city: "Trnava",
    processed_at: "2026-08-21T09:12:00Z",
  };

  it("obchodník je protistranou — presne to, čo párovanie dokladov potrebuje", () => {
    const p = pohybZWallesteru(nakup);
    expect(p).toEqual({
      external_id: "tx-1",
      booking_date: "2026-08-21",
      amount: -45.9,
      currency: "EUR",
      variable_symbol: null,
      counterparty: "SLOVNAFT",
      description: "SLOVNAFT, Trnava",
    });
  });

  it("neúspešná transakcia sa nezapisuje", () => {
    expect(pohybZWallesteru({ ...nakup, is_failed: true })).toBeNull();
  });

  it("bez dátumu alebo bez identifikátora sa nezapisuje", () => {
    expect(
      pohybZWallesteru({ ...nakup, processed_at: null, created_at: null, purchase_date: null }),
    ).toBeNull();
    expect(pohybZWallesteru({ ...nakup, id: null })).toBeNull();
  });

  it("keď chýba dátum spracovania, berie sa nákup a až potom vznik", () => {
    expect(
      pohybZWallesteru({ ...nakup, processed_at: null, purchase_date: "2026-08-19T10:00:00Z" })
        ?.booking_date,
    ).toBe("2026-08-19");
  });

  it("celý zoznam prejde a nepoužiteľné riadky vypadnú", () => {
    const p = pohybyZWallesteru([nakup, { ...nakup, id: "tx-2", is_failed: true }, {}]);
    expect(p.map((x) => x.external_id)).toEqual(["tx-1"]);
  });
});

describe("okno sťahovania", () => {
  it("rok dozadu", () => {
    const o = oknoPohybov(new Date("2026-08-23T12:00:00Z"));
    expect(o.od).toBe("2025-08-23");
    expect(o.do).toBe("2026-08-23");
  });
});
