import { describe, expect, it } from "vitest";
import { platnePolozkySablony } from "./polozky-sablony";

describe("položky opakovanej šablóny (D-09)", () => {
  it("prázdne riadky vypadnú, riadok so sumou bez názvu je chyba", () => {
    const r = platnePolozkySablony([
      { name: "Paušál", unit_price: 100 },
      { name: "", unit_price: 0 },
      { name: "  ", unit_price: "0" },
    ]);
    expect(r.riadky.map((x) => x.name)).toEqual(["Paušál"]);
    expect(r.chyba).toBeNull();
    expect(platnePolozkySablony([{ name: "", unit_price: 50 }]).chyba).toMatch(/názov/);
  });
});
