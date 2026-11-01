import { describe, expect, it } from "vitest";
import { kontrolaPoloziekPonuky } from "./ponuka-polozky";

describe("kontrolaPoloziekPonuky (D-06)", () => {
  it("prázdne riadky vynechá", () => {
    const r = kontrolaPoloziekPonuky([
      { name: "Montáž", unit_price: 50 },
      { name: "", unit_price: 0 },
      { name: "  ", unit_price: "" },
    ]);
    expect(r.chyba).toBeNull();
    expect(r.riadky.map((x) => x.name)).toEqual(["Montáž"]);
  });
  it("riadok so sumou bez názvu je chyba", () => {
    expect(kontrolaPoloziekPonuky([{ name: "", unit_price: 10 }]).chyba).toBe(
      "Položka so sumou musí mať názov.",
    );
  });
  it("bez položiek sa ponuka neuloží (číslo sa nespotrebuje)", () => {
    expect(kontrolaPoloziekPonuky([{ name: "", unit_price: 0 }]).chyba).toBe(
      "Ponuka musí mať aspoň jednu položku.",
    );
  });
});
