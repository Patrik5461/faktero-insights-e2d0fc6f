import { describe, expect, it } from "vitest";
import { jeRozuctovane, podielOdpoctuRiadkov, riadkyDokladu, rozuctovaniePolozkami } from "./rozuctovanie";

// Bloček z čerpačky: nafta 100 € s DPH, bageta 23 € s DPH, všetko 23 %.
const rozpis = [{ sadzba: 23, zaklad: 100, dph: 23 }];
const polozky = [
  { name: "Nafta", vat_rate: 23, total: 100, predkontacia: "PHM" },
  { name: "Bageta", vat_rate: 23, total: 23 },
];
const pomery = {
  PHM: { typ: "dph5050", zaklad: 100, zdanitelna: "PHM1", lenZaklad: "PHM2", nezdanitelna: "PHM3" },
};

describe("predkontácia na položku a účtovanie pomerom", () => {
  it("rozdelí sumy podľa položiek, položka bez kódu dostane kód hlavičky", () => {
    const r = rozuctovaniePolozkami(polozky, rozpis, "1Pv", "PD");
    expect(r.map((x) => [x.predkontacia, x.zaklad, x.dph])).toEqual([
      ["PHM", 81.3, 18.7],
      ["1Pv", 18.7, 4.3],
    ]);
  });

  it("palivo s DPH 50/50 sa rozvinie, bageta ostáva celá", () => {
    const r = riadkyDokladu({ items: polozky }, rozpis, "1Pv", "PD", pomery);
    expect(r.map((x) => [x.predkontacia, x.zaklad, x.dph, x.odpocet ?? true])).toEqual([
      ["PHM1", 40.65, 9.35, true],
      ["PHM2", 40.65, 9.35, false],
      ["1Pv", 18.7, 4.3, true],
    ]);
    expect(jeRozuctovane(r)).toBe(true);
    // Odpočíta sa DPH bagety a polovica DPH nafty: (9,35 + 4,3) / 23.
    expect(podielOdpoctuRiadkov(r)).toBeCloseTo(13.65 / 23, 5);
  });

  it("bez kódov na položkách platí hlavička; pomer v hlavičke rozúčtuje celý doklad", () => {
    const bez = riadkyDokladu({ items: [{ name: "X", vat_rate: 23, total: 123 }] }, rozpis, "1Pv", "PD", pomery);
    expect(bez).toHaveLength(1);
    expect(jeRozuctovane(bez)).toBe(false);
    const cely = riadkyDokladu({}, rozpis, "PHM", "PD", pomery);
    expect(cely.map((x) => x.predkontacia)).toEqual(["PHM1", "PHM2"]);
  });

  it("položka so sadzbou, ktorú doklad nemá, rozúčtovanie zruší", () => {
    expect(rozuctovaniePolozkami([{ vat_rate: 5, total: 10, predkontacia: "X" }], rozpis, "1Pv", null)).toEqual([]);
  });
});
