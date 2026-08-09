import { describe, it, expect } from "vitest";
import {
  nakladZJazdy,
  nakladZPohybu,
  prekrocenyRozpocet,
  vyhodnotZakazku,
  vynosZFaktury,
} from "./zakazky";

describe("vynosZFaktury", () => {
  it("bežná faktúra ide do výnosov bez DPH", () => {
    expect(vynosZFaktury({ type: "regular", status: "sent", subtotal: 1000 })).toBe(1000);
  });

  // Toto je najdrahšia chyba, akú sa tu dá spraviť: zálohová faktúra aj
  // vyúčtovacia znejú na tú istú sumu, takže by sa zákazka tvárila dvojnásobne
  // zisková.
  it("zálohová faktúra sa do výnosov nepočíta", () => {
    expect(vynosZFaktury({ type: "proforma", status: "sent", subtotal: 1000 })).toBe(0);
  });

  it("dobropis výnos znižuje aj pri kladnej sume", () => {
    expect(vynosZFaktury({ type: "credit_note", status: "issued", subtotal: 200 })).toBe(-200);
    expect(vynosZFaktury({ type: "credit_note", status: "issued", subtotal: -200 })).toBe(-200);
  });

  it("koncept, storno a zmazaná faktúra sa nepočítajú", () => {
    expect(vynosZFaktury({ type: "regular", status: "draft", subtotal: 500 })).toBe(0);
    expect(vynosZFaktury({ type: "regular", status: "cancelled", subtotal: 500 })).toBe(0);
    expect(
      vynosZFaktury({ type: "regular", status: "paid", subtotal: 500, deleted_at: "2026-01-01" }),
    ).toBe(0);
  });
});

describe("nakladZPohybu", () => {
  it("výdaj sa oceňuje váženou nákupnou cenou, nie predajnou", () => {
    expect(nakladZPohybu({ type: "vydaj", quantity: 10, unit_cost: 3.5, total_value: 90 })).toBe(
      35,
    );
  });

  it("výdaj cez faktúru je tiež spotreba", () => {
    expect(nakladZPohybu({ type: "faktura", quantity: 2, unit_cost: 12 })).toBe(24);
  });

  it("vrátenie materiálu náklad znižuje", () => {
    expect(nakladZPohybu({ type: "prijem", quantity: 4, unit_cost: 5 })).toBe(-20);
    expect(nakladZPohybu({ type: "dobropis", quantity: 1, unit_cost: 5 })).toBe(-5);
  });

  it("inventúra a oprava nie sú náklad zákazky", () => {
    expect(nakladZPohybu({ type: "inventura", quantity: 100, unit_cost: 9 })).toBe(0);
    expect(nakladZPohybu({ type: "oprava", quantity: 100, unit_cost: 9 })).toBe(0);
  });

  // Pohyby spred oceňovania majú `unit_cost` NULL — vtedy je lepšie počítať
  // s uloženou hodnotou než s nulou, ktorá by zákazku ukázala bezplatnú.
  it("bez váženej ceny padne späť na uloženú hodnotu pohybu", () => {
    expect(nakladZPohybu({ type: "vydaj", quantity: 3, unit_cost: null, total_value: 60 })).toBe(
      60,
    );
  });
});

describe("nakladZJazdy", () => {
  // `fuel_consumption` sú litre za jazdu, nie spotreba na 100 km — formuláre
  // ukladajú už vynásobený súčin. Delenie stovkou by náklad podstrelilo stokrát.
  it("litre krát cena paliva", () => {
    expect(nakladZJazdy({ fuel_consumption: 16, fuel_price: 1.5 })).toBeCloseTo(24, 6);
  });

  it("bez ceny paliva alebo spotreby je náklad nula, nie NaN", () => {
    expect(nakladZJazdy({ fuel_consumption: null, fuel_price: 1.5 })).toBe(0);
    expect(nakladZJazdy({ fuel_consumption: 16, fuel_price: null })).toBe(0);
  });
});

describe("vyhodnotZakazku", () => {
  it("poskladá výnosy, tri druhy nákladov a maržu", () => {
    const v = vyhodnotZakazku({
      faktury: [
        { type: "regular", status: "paid", subtotal: 10000 },
        { type: "proforma", status: "sent", subtotal: 5000 },
      ],
      pohyby: [{ type: "vydaj", quantity: 100, unit_cost: 40 }],
      prijateFaktury: [{ amount_without_vat: 1500 }],
      jazdy: [{ fuel_consumption: 40, fuel_price: 1.5 }],
    });
    expect(v.vynosy).toBe(10000);
    expect(v.naklad_material).toBe(4000);
    expect(v.naklad_sluzby).toBe(1500);
    expect(v.naklad_doprava).toBe(60);
    expect(v.naklady).toBe(5560);
    expect(v.zisk).toBe(4440);
    expect(v.marza).toBe(44.4);
  });

  it("prázdna zákazka nevyrobí NaN ani delenie nulou", () => {
    const v = vyhodnotZakazku({});
    expect(v.vynosy).toBe(0);
    expect(v.naklady).toBe(0);
    expect(v.zisk).toBe(0);
    expect(v.marza).toBeNull();
    expect(v.plnenie_vynosu).toBeNull();
  });

  it("náklady bez výnosov nedajú maržu, len záporný zisk", () => {
    const v = vyhodnotZakazku({ pohyby: [{ type: "vydaj", quantity: 1, unit_cost: 100 }] });
    expect(v.zisk).toBe(-100);
    expect(v.marza).toBeNull();
  });

  it("plán sa porovnáva so skutočnosťou", () => {
    const v = vyhodnotZakazku({
      faktury: [{ type: "regular", status: "sent", subtotal: 6000 }],
      prijateFaktury: [{ amount_without_vat: 4500 }],
      planovanyVynos: 12000,
      planovanyNaklad: 9000,
    });
    expect(v.planovany_zisk).toBe(3000);
    expect(v.plnenie_vynosu).toBe(50);
    expect(v.cerpanie_nakladu).toBe(50);
    expect(prekrocenyRozpocet(v)).toBe(false);
  });

  it("prekročený rozpočet sa pozná", () => {
    const v = vyhodnotZakazku({
      prijateFaktury: [{ amount_without_vat: 9500 }],
      planovanyNaklad: 9000,
    });
    expect(prekrocenyRozpocet(v)).toBe(true);
  });

  it("bez plánu sa nič neprekračuje", () => {
    expect(
      prekrocenyRozpocet(vyhodnotZakazku({ prijateFaktury: [{ amount_without_vat: 99 }] })),
    ).toBe(false);
  });

  it("centy sa nerozsypú na plávajúcej čiarke", () => {
    const v = vyhodnotZakazku({
      faktury: [
        { type: "regular", status: "sent", subtotal: 0.1 },
        { type: "regular", status: "sent", subtotal: 0.2 },
      ],
    });
    expect(v.vynosy).toBe(0.3);
  });
});
