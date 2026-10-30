import { describe, expect, it } from "vitest";
import { zlucEetSFotkou } from "./blocek-eet";
import { jeQrPokladnice } from "./blocek-z-appky";
import type { BlocekVysledok } from "./blocek.functions";

const eet: BlocekVysledok = {
  zdroj: "qr",
  overeny: false,
  qr_raw: "EET*1.0*DIC:CZ27082440*KC:121.00*DT:202610291200",
  supplier: "Alza.cz a.s.",
  supplier_ico: "27082440",
  supplier_dic: "CZ27082440",
  total: 121,
  currency: "CZK",
  date: "2026-10-29",
  items: [],
};

describe("zlucEetSFotkou", () => {
  it("fotka bez výsledku: údaje z QR ostanú (predtým prázdny formulár)", () => {
    const v = zlucEetSFotkou(eet, null);
    expect(v.total).toBe(121);
    expect(v.date).toBe("2026-10-29");
    expect(v.currency).toBe("CZK");
    expect(v.supplier).toBe("Alza.cz a.s.");
    expect(jeQrPokladnice(v)).toBe(true);
  });

  it("hlavička z QR, položky z fotky — a ide medzi Bločky", () => {
    const foto: BlocekVysledok = {
      zdroj: "foto",
      overeny: false,
      supplier: "ALZA",
      total: 12.1,
      currency: "EUR",
      date: "2026-10-01",
      vat_rate: 21,
      items: [{ name: "Kábel", quantity: 1, unit_price: 100, vat_rate: 21, total: 100 }],
    };
    const v = zlucEetSFotkou(eet, foto, "Suma, dátum a predajca sú z QR kódu.");
    expect(v.zdroj).toBe("qr");
    expect(jeQrPokladnice(v)).toBe(true);
    expect(v.total).toBe(121);
    expect(v.currency).toBe("CZK");
    expect(v.date).toBe("2026-10-29");
    expect(v.supplier).toBe("Alza.cz a.s.");
    expect(v.items).toHaveLength(1);
    expect(v.vat_rate).toBe(21);
    expect(v.qr_raw).toBe(eet.qr_raw);
  });
});
