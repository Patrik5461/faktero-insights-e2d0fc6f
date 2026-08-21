import { describe, it, expect } from "vitest";
import { suctyFaktury, riadkyNaZapis, moznoUpravit, moznoZmazat } from "./faktura-uprava";

const R = (o: Partial<Parameters<typeof suctyFaktury>[0][number]>) => ({
  name: "Práca",
  quantity: 1,
  unit: "ks",
  unit_price: 100,
  vat_rate: 23,
  ...o,
});

describe("oprava faktúry v telefóne", () => {
  it("počíta rovnaké súčty ako web", () => {
    expect(suctyFaktury([R({}), R({ quantity: 2, unit_price: 50 })])).toEqual({
      subtotal: 200,
      vat_total: 46,
      total: 246,
    });
    // Nulová sadzba (neplatca DPH) nesmie nič pripočítať.
    expect(suctyFaktury([R({ vat_rate: 0, unit_price: 33.33 })])).toEqual({
      subtotal: 33.33,
      vat_total: 0,
      total: 33.33,
    });
    expect(suctyFaktury([])).toEqual({ subtotal: 0, vat_total: 0, total: 0 });
  });

  it("zaokrúhľuje na centy, nie na zlomky", () => {
    // 3 × 3,33 = 9,99; DPH 23 % = 2,2977 → 2,30
    const s = suctyFaktury([R({ quantity: 3, unit_price: 3.33 })]);
    expect(s).toEqual({ subtotal: 9.99, vat_total: 2.3, total: 12.29 });
  });

  it("riadky na zápis nesú poradie aj svoje sumy", () => {
    const rows = riadkyNaZapis("f-1", [R({ name: "  Montáž  " }), R({ quantity: 2 })]);
    expect(rows[0]).toMatchObject({
      invoice_id: "f-1",
      position: 1,
      name: "Montáž",
      unit: "ks",
      subtotal: 100,
      vat_amount: 23,
      total: 123,
    });
    expect(rows[1]!.position).toBe(2);
    expect(rows[1]!.total).toBe(246);
  });

  it("prázdna jednotka sa nahradí kusmi", () => {
    expect(riadkyNaZapis("f-1", [R({ unit: "" })])[0]!.unit).toBe("ks");
  });

  it("stornovaná sa neopravuje a skladová ide na počítač", () => {
    expect(moznoUpravit({ status: "sent" })).toEqual({ ok: true });
    // Uhradenú faktúru opraviť treba — preklep v adrese sa nájde až po platbe.
    expect(moznoUpravit({ status: "paid" })).toEqual({ ok: true });
    expect(moznoUpravit({ status: "cancelled" })).toEqual({
      ok: false,
      dovod: "Stornovaná faktúra sa už neopravuje.",
    });
    const skladova = moznoUpravit({ status: "sent", maSkladovePolozky: true });
    expect(skladova.ok).toBe(false);
    expect(skladova.ok === false && skladova.dovod).toContain("na počítači");
  });

  it("zmazať sa dá to, čo ešte zmazané nie je", () => {
    expect(moznoZmazat({ deleted_at: null })).toBe(true);
    expect(moznoZmazat({ deleted_at: "2026-08-21T10:00:00Z" })).toBe(false);
  });
});
