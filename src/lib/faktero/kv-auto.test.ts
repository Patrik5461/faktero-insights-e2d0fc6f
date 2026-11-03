import { describe, expect, it } from "vitest";
import {
  kvAutoBlocku,
  kvAutoNespracovaneho,
  kvAutoPrijatej,
  kvAutoVystavenej,
  textKv,
  textKvAuto,
} from "./kv-auto";

const t = (k: string, p?: Record<string, string | number>) =>
  k.replace(/\{(\w+)\}/g, (_, x) => String(p?.[x] ?? ""));

describe("kv-auto — čo doklad dostane, keď je pole prázdne", () => {
  it("prijatá faktúra", () => {
    expect(kvAutoPrijatej({ type: "regular", amount_total: 123, vat_amount: 23 })).toBe("B2");
    expect(kvAutoPrijatej({ type: "regular", amount_total: -123, vat_amount: -23 })).toBe("C2");
    expect(kvAutoPrijatej({ type: "regular", vat_amount: 0, dph_rezim: "samozdanenie" })).toBe(
      "B1",
    );
    expect(kvAutoPrijatej({ type: "regular", vat_amount: 23, odpocet: false })).toBe("");
    expect(kvAutoPrijatej({ type: "regular", vat_amount: 0 })).toBe("");
    expect(kvAutoPrijatej({ type: "proforma", vat_amount: 23 })).toBe("");
    expect(kvAutoPrijatej({ type: "regular", vat_amount: 23 }, { clenenie: "PN" })).toBe("");
    expect(kvAutoPrijatej({ type: "regular", vat_amount: 23 }, { predvolene: "B3" })).toBe("B3");
  });
  it("bloček", () => {
    expect(kvAutoBlocku({ vat_amount: 2.3 })).toBe("B3");
    expect(kvAutoBlocku({ vat_amount: 0, vat_breakdown: [{ dph: 1.15 }] })).toBe("B3");
    expect(kvAutoBlocku({ vat_amount: 0 })).toBe("");
    expect(kvAutoBlocku({ vat_amount: 2.3 }, { predvolene: "B2" })).toBe("B2");
  });
  it("vystavená faktúra a dobropis", () => {
    const firma = { type: "regular", vat_total: 23, customer_ico: "12345678" };
    expect(kvAutoVystavenej(firma)).toBe("A1");
    expect(kvAutoVystavenej({ type: "regular", vat_total: 23 })).toBe("D2");
    expect(kvAutoVystavenej({ ...firma, type: "credit_note", vat_total: -23 })).toBe("C1");
    expect(kvAutoVystavenej({ ...firma, reverse_charge: true, vat_total: 0 })).toBe("A2");
    expect(
      kvAutoVystavenej({
        ...firma,
        reverse_charge: true,
        reverse_charge_type: "eu_b2b",
        vat_total: 0,
      }),
    ).toBe("");
    expect(kvAutoVystavenej({ ...firma, type: "proforma" })).toBe("");
    expect(kvAutoVystavenej({ ...firma, type: "advance_payment" })).toBe("A1");
  });
  it("nespracovaný doklad podľa druhu", () => {
    const u = { rozpis: [{ dph: 23 }], celkom: 123 };
    expect(kvAutoNespracovaneho("", u)).toBeUndefined();
    expect(kvAutoNespracovaneho("faktura", u)).toBe("B2");
    expect(kvAutoNespracovaneho("dobropis", u)).toBe("C2");
    expect(kvAutoNespracovaneho("zalohova", u)).toBe("");
    expect(kvAutoNespracovaneho("blocek", u)).toBe("B3");
    expect(kvAutoNespracovaneho("faktura", { ...u, prenesenie: true })).toBe("B1");
  });
  it("texty", () => {
    expect(textKvAuto(t, "B2")).toBe("automaticky (B2)");
    expect(textKvAuto(t, "")).toBe("automaticky — do KV nepatrí");
    expect(textKvAuto(t, undefined)).toBe("automaticky");
    expect(textKv(t, "X", "B2")).toBe("nezahŕňať do KV");
    expect(textKv(t, "", "B2")).toBe("automaticky (B2)");
  });
});
