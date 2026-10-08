import { describe, expect, it } from "vitest";
import { duplicityVZozname, jeTaIstaPrijata, normCislo, normNazov } from "./prijate-duplicity";

/*
  Tá istá prijatá faktúra dvakrát — v PALIERA prišla FV-81967/2026 mailom
  23. 9. aj 6. 10. a vznikla dvakrát (október 2026).
*/

const a = {
  invoice_number: "FV-81967/2026",
  supplier_name: "Commander Services s.r.o.",
  supplier_iban: "SK9311000000002626712658",
  amount_total: 98.4,
};

describe("duplicity prijatých faktúr", () => {
  it("číslo zapísané inak je to isté číslo", () => {
    expect(normCislo("FV-81967/2026")).toBe(normCislo("fv 81967 2026"));
    expect(normCislo("0000020375")).toBe(normCislo("20375"));
  });

  it("názov dodávateľa bez právnej formy a diakritiky", () => {
    expect(normNazov("Commander Services, s. r. o.")).toBe(normNazov("COMMANDER SERVICES s.r.o."));
  });

  it("PALIERA: rovnaké číslo, názov aj IBAN = tá istá faktúra", () => {
    expect(jeTaIstaPrijata(a, { ...a })).toBe(true);
  });

  it("rovnaké číslo od iného dodávateľa nie je duplicita", () => {
    expect(jeTaIstaPrijata({ ...a, supplier_ico: "11111111" }, { ...a, supplier_ico: "22222222" })).toBe(false);
    expect(jeTaIstaPrijata(a, { ...a, supplier_name: "Iná firma s.r.o.", supplier_iban: null })).toBe(false);
  });

  it("bez údajov o dodávateľovi rozhodne suma", () => {
    expect(jeTaIstaPrijata({ invoice_number: "123", amount_total: 10 }, { invoice_number: "123", amount_total: 10 })).toBe(true);
    expect(jeTaIstaPrijata({ invoice_number: "123", amount_total: 10 }, { invoice_number: "123", amount_total: 12 })).toBe(false);
  });

  it("v zozname označí oba riadky", () => {
    const m = duplicityVZozname([
      { id: "1", ...a },
      { id: "2", ...a },
      { id: "3", ...a, invoice_number: "FV-1/2026" },
    ]);
    expect([...m.keys()].sort()).toEqual(["1", "2"]);
  });
});
