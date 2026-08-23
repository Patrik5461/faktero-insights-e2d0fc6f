import { describe, it, expect } from "vitest";
import {
  jeBezny,
  oknoVypisu,
  pohybyZVypisu,
  pohybZWise,
  protistranaZWise,
  ucetZWise,
  vsZReferencie,
} from "./wise";

describe("zostatky Wise", () => {
  it("z každej meny je samostatný účet a berie sa hotovostná časť", () => {
    const u = ucetZWise({
      id: 200001,
      currency: "EUR",
      type: "STANDARD",
      name: null,
      amount: { value: 5150.75, currency: "EUR" },
      cashAmount: { value: 310.86, currency: "EUR" },
    });
    expect(u).toEqual({
      external_account_id: "200001",
      iban: null,
      account_name: "Wise EUR",
      currency: "EUR",
      // Nie 5150,75 — to je aj s investovanou časťou, ktorou sa platiť nedá.
      balance: 310.86,
    });
  });

  it("pomenovaný zostatok si meno nechá", () => {
    expect(ucetZWise({ id: 1, currency: "USD", name: "Rezerva" }).account_name).toBe("Rezerva");
  });

  it("sporiaci zostatok nie je prevádzkový účet", () => {
    expect(jeBezny({ id: 1, currency: "EUR", type: "STANDARD" })).toBe(true);
    expect(jeBezny({ id: 2, currency: "EUR", type: "SAVINGS" })).toBe(false);
    // Bez uvedeného druhu berieme bežný — starší tvar odpovede ho nemal.
    expect(jeBezny({ id: 3, currency: "EUR" })).toBe(true);
  });
});

describe("pohyby z výpisu", () => {
  const platbaKartou = {
    type: "DEBIT",
    date: "2026-03-15T10:30:00.000Z",
    amount: { value: -7.76, currency: "EUR" },
    totalFees: { value: 0.04, currency: "EUR" },
    details: { type: "CARD", description: "Card transaction of 6.80 GBP issued by Tfl.gov.uk" },
    referenceNumber: "CARD-249281",
  };

  it("odchádzajúca platba ostáva záporná a poplatok sa neodpočítava druhýkrát", () => {
    const p = pohybZWise(platbaKartou, "200001");
    expect(p?.amount).toBe(-7.76);
    expect(p?.booking_date).toBe("2026-03-15");
    expect(p?.currency).toBe("EUR");
    expect(p?.external_id).toBe("200001:CARD-249281");
  });

  it("protistrana sa z popisu karty nevymýšľa", () => {
    // Vytiahnuť „Tfl.gov.uk" z vety by znamenalo párovať doklady s hocičím.
    expect(protistranaZWise(platbaKartou)).toBeNull();
    expect(protistranaZWise({ details: { senderName: "ACME s.r.o." } })).toBe("ACME s.r.o.");
    expect(protistranaZWise({ details: { recipientName: "Dodávateľ" } })).toBe("Dodávateľ");
  });

  it("variabilný symbol len z čísla, nie z ľubovoľného textu", () => {
    expect(vsZReferencie("2026114")).toBe("2026114");
    expect(vsZReferencie("faktura 2026114")).toBeNull();
    expect(vsZReferencie(null)).toBeNull();
  });

  it("riadok bez dátumu alebo bez sumy sa nezapíše", () => {
    expect(pohybZWise({ amount: { value: -5, currency: "EUR" } }, "1")).toBeNull();
    expect(pohybZWise({ date: "2026-03-15T00:00:00Z" }, "1")).toBeNull();
  });

  it("celý výpis prejde a nepoužiteľné riadky vypadnú", () => {
    const pohyby = pohybyZVypisu(
      {
        transactions: [
          platbaKartou,
          { type: "CREDIT" },
          { ...platbaKartou, referenceNumber: "X2" },
        ],
      },
      "200001",
    );
    expect(pohyby).toHaveLength(2);
    expect(pohyby.map((p) => p.external_id)).toEqual(["200001:CARD-249281", "200001:X2"]);
  });

  it("prázdny výpis nie je chyba", () => {
    expect(pohybyZVypisu(null, "1")).toEqual([]);
    expect(pohybyZVypisu({}, "1")).toEqual([]);
  });

  it("dva zostatky nemajú rovnaké identifikátory pohybov", () => {
    const a = pohybZWise(platbaKartou, "200001");
    const b = pohybZWise(platbaKartou, "200002");
    expect(a?.external_id).not.toBe(b?.external_id);
  });
});

describe("okno výpisu", () => {
  it("berie rok dozadu, nie viac — Wise dlhšie okno odmieta", () => {
    const { od, do: doKedy } = oknoVypisu(new Date("2026-08-23T12:00:00Z"));
    expect(od.slice(0, 10)).toBe("2025-08-24");
    expect(doKedy.slice(0, 10)).toBe("2026-08-23");
  });
});
