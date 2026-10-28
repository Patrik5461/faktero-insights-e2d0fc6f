import { describe, expect, it } from "vitest";
import {
  pokynPredponObjednavky,
  menaPreVytazenie,
  pokynCitania,
  pokynDomacejMeny,
} from "./vytazenie-mena";
import { nastaveniaNespracovanych } from "./nespracovane-nastavenia";
import { udajeZAi } from "./nespracovane";

const ZAKLAD = `Si účtovník. Vráť JSON.
Do "items" daj riadky.
Čo na doklade nie je, nechaj null — nič si nevymýšľaj.`;

describe("menaPreVytazenie", () => {
  it("zapnuté: domáca mena podľa krajiny firmy", () => {
    expect(menaPreVytazenie(true, "SK")).toBe("EUR");
    expect(menaPreVytazenie(true, "CZ")).toBe("CZK");
    expect(menaPreVytazenie(true, "Česká republika")).toBe("CZK");
    expect(menaPreVytazenie(true, null)).toBe("EUR");
  });
  it("vypnuté: nič sa neuprednostňuje", () => {
    expect(menaPreVytazenie(false, "CZ")).toBeNull();
  });
  it("nastavenie je predvolene zapnuté a dá sa vypnúť", () => {
    expect(nastaveniaNespracovanych(null).domacaMena).toBe(true);
    expect(nastaveniaNespracovanych({ nespracovane: { domacaMena: false } }).domacaMena).toBe(
      false,
    );
  });
});

describe("pokynCitania", () => {
  it("bez nastavenia je pokyn nezmenený", () => {
    expect(pokynCitania(ZAKLAD)).toBe(ZAKLAD);
    expect(pokynCitania(ZAKLAD, null)).toBe(ZAKLAD);
    expect(pokynCitania(ZAKLAD, { domacaMena: null })).toBe(ZAKLAD);
    expect(pokynCitania(ZAKLAD, { domacaMena: "nie-mena" })).toBe(ZAKLAD);
  });

  it("s domácou menou pridá doplnok pred záverečnú vetu", () => {
    const p = pokynCitania(ZAKLAD, { domacaMena: "CZK" });
    expect(p.startsWith("Si účtovník.")).toBe(true);
    expect(p).toContain('vráť "amount_without_vat"');
    expect(p).toContain('do "currency" daj "CZK"');
    expect(p).toContain('"original_currency"');
    expect(p).toContain('"items_currency"');
    // Doklady len v jednej mene sa nemenia.
    expect(p).toContain("Keď je doklad len v jednej mene, sumy ani menu nemeň");
    expect(p.trimEnd().endsWith("nič si nevymýšľaj.")).toBe(true);
    expect(p.indexOf("Keď sú na doklade sumy vo VIAC menách")).toBeLessThan(
      p.indexOf("Čo na doklade nie je"),
    );
  });

  it("mena sa normalizuje na veľké písmená; bez záverečnej vety sa doplnok pridá na koniec", () => {
    expect(pokynDomacejMeny(" eur ")).toContain('"EUR"');
    const p = pokynCitania("Vráť JSON.", { domacaMena: "EUR" });
    expect(p.startsWith("Vráť JSON.")).toBe(true);
    expect(p).toContain('do "currency" daj "EUR"');
  });
});

describe("udajeZAi — položky v inej mene ako sumy", () => {
  const ai = {
    supplier_name: "Dodávateľ s.r.o.",
    amount_without_vat: 100,
    vat_amount: 21,
    amount_total: 121,
    currency: "EUR",
    items: [{ name: "Služba", quantity: 1, unit_price: 2500, vat_rate: 21, total: 3025 }],
  };
  it("sumy v domácej mene, položky v cudzej — položky čakajú vypnuté", () => {
    const u = udajeZAi({ ...ai, items_currency: "CZK", original_currency: "CZK" }, "2026-10-22");
    expect(u.mena).toBe("EUR");
    expect(u.polozky).toHaveLength(1);
    expect(u.polozkyVypnute).toBe(true);
  });
  it("doklad v jednej mene sa nemení", () => {
    expect(udajeZAi(ai, "2026-10-22").polozkyVypnute).toBeUndefined();
    expect(udajeZAi({ ...ai, items_currency: "EUR" }, "2026-10-22").polozkyVypnute).toBeUndefined();
    expect(udajeZAi({ ...ai, items_currency: null }, "2026-10-22").polozkyVypnute).toBeUndefined();
  });
});

describe("pokyn s predponami čísla objednávky", () => {
  it("bez predpôn sa pokyn nemení, s nimi ich AI dostane a záver ostane posledný", () => {
    const zaklad = "Pokyn.\nČo na doklade nie je, nechaj null — nič si nevymýšľaj.";
    expect(pokynPredponObjednavky([])).toBe("");
    expect(pokynCitania(zaklad, { predponyObjednavky: [] })).toBe(zaklad);
    const s = pokynCitania(zaklad, { predponyObjednavky: ["OBJ-", 'P"O'] });
    expect(s).toContain('„OBJ-"');
    expect(s).toContain('„PO"');
    expect(s.trimEnd().endsWith("nič si nevymýšľaj.")).toBe(true);
  });
});
