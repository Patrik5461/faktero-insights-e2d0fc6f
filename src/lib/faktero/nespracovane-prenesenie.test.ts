import { describe, expect, it } from "vitest";
import { jePrenesenieZAi, udajeZAi } from "./nespracovane";

describe("vyčítanie prijatej faktúry — daňová povinnosť", () => {
  it("dátum dodania z dokladu, nie dátum vystavenia", () => {
    const u = udajeZAi(
      { issue_date: "2026-10-10", delivery_date: "2026-09-30", supplier_name: "X" },
      "2026-10-13",
    );
    expect(u.datumDodania).toBe("2026-09-30");
    expect(udajeZAi({ issue_date: "2026-10-10" }, "2026-10-13").datumDodania).toBe("2026-10-10");
  });
  it("prenesenie z príznaku, z vety na doklade aj zo všetkých položiek", () => {
    expect(jePrenesenieZAi({ reverse_charge: true })).toBe(true);
    expect(
      jePrenesenieZAi({
        reverse_charge: false,
        reverse_charge_text: "Prenesenie daňovej povinnosti podľa § 69 ods. 12 písm. j)",
      }),
    ).toBe(true);
    expect(jePrenesenieZAi({ reverse_charge_text: "Reverse charge" })).toBe(true);
    expect(jePrenesenieZAi({}, [{ pdp: true }, { pdp: true }])).toBe(true);
    expect(jePrenesenieZAi({}, [{ pdp: true }, {}])).toBe(false);
    expect(jePrenesenieZAi({ reverse_charge_text: "Ďakujeme za nákup" })).toBe(false);
  });
  it("udajeZAi nastaví prenesenie aj bez príznaku, keď je veta na doklade", () => {
    const u = udajeZAi(
      {
        supplier_name: "Stavby",
        issue_date: "2026-10-01",
        reverse_charge_text: "Daň odvedie odberateľ",
      },
      "2026-10-13",
    );
    expect(u.prenesenie).toBe(true);
  });
});
