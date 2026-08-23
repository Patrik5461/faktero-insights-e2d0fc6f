import { describe, it, expect } from "vitest";
import {
  jeZivy,
  oknoPohybov,
  pohybyZRevolutu,
  pohybyZTransakcie,
  protistranaZRevolutu,
  ucetZRevolutu,
} from "./revolut";

describe("účty Revolutu", () => {
  it("z každej meny je samostatný účet", () => {
    expect(ucetZRevolutu({ id: "a1", name: null, balance: 1240.5, currency: "EUR" })).toEqual({
      external_account_id: "a1",
      iban: null,
      account_name: "Revolut EUR",
      currency: "EUR",
      balance: 1240.5,
    });
  });

  it("zrušený účet do knihy bánk nepatrí", () => {
    expect(jeZivy({ id: "a", state: "active" })).toBe(true);
    expect(jeZivy({ id: "a", state: "inactive" })).toBe(false);
  });
});

const kartou = {
  id: "tx-1",
  type: "card_payment",
  state: "completed",
  created_at: "2026-08-20T08:00:00Z",
  completed_at: "2026-08-21T09:00:00Z",
  legs: [
    {
      leg_id: "l1",
      account_id: "acc-eur",
      amount: -45.9,
      currency: "EUR",
      description: "Slovnaft",
    },
  ],
  merchant: { name: "SLOVNAFT", city: "Trnava" },
};

describe("pohyby", () => {
  it("berie sa noha daného účtu a znamienko z Revolutu", () => {
    expect(pohybyZTransakcie(kartou, "acc-eur")).toEqual([
      {
        external_id: "tx-1:l1",
        booking_date: "2026-08-21",
        amount: -45.9,
        currency: "EUR",
        variable_symbol: null,
        counterparty: "SLOVNAFT",
        description: "SLOVNAFT, Trnava",
      },
    ]);
  });

  it("cudzia noha sa k účtu nepripíše", () => {
    expect(pohybyZTransakcie(kartou, "acc-usd")).toEqual([]);
  });

  it("výmena mien sa zapíše na obidva účty, každý raz", () => {
    const vymena = {
      id: "tx-2",
      type: "exchange",
      state: "completed",
      completed_at: "2026-08-21T10:00:00Z",
      legs: [
        { leg_id: "l1", account_id: "acc-eur", amount: -100, currency: "EUR" },
        { leg_id: "l2", account_id: "acc-usd", amount: 108.4, currency: "USD" },
      ],
    };
    const eur = pohybyZTransakcie(vymena, "acc-eur");
    const usd = pohybyZTransakcie(vymena, "acc-usd");
    expect(eur).toHaveLength(1);
    expect(usd).toHaveLength(1);
    expect(eur[0].amount).toBe(-100);
    expect(usd[0].amount).toBe(108.4);
    // Bez identifikátora nohy by druhá noha vypadla ako duplicita.
    expect(eur[0].external_id).not.toBe(usd[0].external_id);
  });

  it("nezaúčtovaná transakcia sa nezapisuje", () => {
    for (const stav of ["pending", "declined", "failed", "reverted"]) {
      expect(pohybyZTransakcie({ ...kartou, state: stav }, "acc-eur")).toEqual([]);
    }
  });

  it("keď chýba dátum dokončenia, berie sa vznik", () => {
    expect(pohybyZTransakcie({ ...kartou, completed_at: null }, "acc-eur")[0].booking_date).toBe(
      "2026-08-20",
    );
  });

  it("obchodník je protistranou, z popisu prevodu sa meno nehádže", () => {
    expect(protistranaZRevolutu(kartou)).toBe("SLOVNAFT");
    expect(
      protistranaZRevolutu({
        id: "x",
        legs: [
          { leg_id: "l", account_id: "a", amount: 1, currency: "EUR", description: "Jan Novak" },
        ],
      }),
    ).toBeNull();
  });

  it("variabilný symbol len z číselnej referencie", () => {
    const sVs = { ...kartou, reference: "2026114", merchant: null };
    expect(pohybyZTransakcie(sVs, "acc-eur")[0].variable_symbol).toBe("2026114");
    const bezVs = { ...kartou, reference: "za tovar", merchant: null };
    expect(pohybyZTransakcie(bezVs, "acc-eur")[0].variable_symbol).toBeNull();
  });

  it("celý zoznam prejde", () => {
    expect(
      pohybyZRevolutu([kartou, { ...kartou, id: "tx-9", state: "declined" }], "acc-eur"),
    ).toHaveLength(1);
    expect(pohybyZRevolutu(null, "acc-eur")).toEqual([]);
  });
});

describe("okno sťahovania", () => {
  it("rok dozadu", () => {
    expect(oknoPohybov(new Date("2026-08-23T12:00:00Z"))).toEqual({
      od: "2025-08-23",
      do: "2026-08-23",
    });
  });
});
