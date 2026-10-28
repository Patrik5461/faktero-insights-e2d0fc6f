import { describe, expect, it } from "vitest";
import {
  dniPoSplatnosti,
  stavUhradyPrijatej,
  sumarPoSadzbach,
  typPrijatejFaktury,
  zostaneKUhrade,
} from "./uhrady-prijatej";

const u = (amount: number, paid_at = "2026-10-01") => ({ id: String(amount), amount, paid_at });

describe("stavUhradyPrijatej", () => {
  it("neuhradená bez úhrad", () => {
    const s = stavUhradyPrijatej({ amount_total: 98.4, status: "received", uhrady: [] });
    expect(s).toMatchObject({ naUhradu: 98.4, uhradene: 0, zostava: 98.4, stav: "neuhradena" });
  });
  it("čiastočná úhrada", () => {
    const s = stavUhradyPrijatej({
      amount_total: "100.00",
      status: "booked",
      uhrady: [u(40), u(20.5)],
    });
    expect(s).toMatchObject({ uhradene: 60.5, zostava: 39.5, stav: "ciastocne", preplatene: 0 });
  });
  it("uhradená celá aj s preplatkom", () => {
    expect(stavUhradyPrijatej({ amount_total: 100, uhrady: [u(100)] }).stav).toBe("uhradena");
    const p = stavUhradyPrijatej({ amount_total: 100, uhrady: [u(60), u(50)] });
    expect(p).toMatchObject({ zostava: 0, preplatene: 10, stav: "uhradena" });
  });
  it("dobropis so zápornou sumou sa uhrádza absolútnou hodnotou", () => {
    const s = stavUhradyPrijatej({ amount_total: -50, uhrady: [u(20)] });
    expect(s).toMatchObject({ celkom: 50, zostava: 30, stav: "ciastocne" });
  });
  it("zaplatená záloha sa odpočíta", () => {
    const s = stavUhradyPrijatej({ amount_total: 1000, zaloha: 400, uhrady: [] });
    expect(s).toMatchObject({ naUhradu: 600, zostava: 600 });
    expect(stavUhradyPrijatej({ amount_total: 400, zaloha: 400, uhrady: [] }).stav).toBe(
      "uhradena",
    );
  });
  it("stará zaplatená faktúra bez riadkov úhrad je uhradená", () => {
    const s = stavUhradyPrijatej({ amount_total: 120, status: "paid", uhrady: [] });
    expect(s).toMatchObject({ uhradene: 120, zostava: 0, stav: "uhradena" });
  });
  it("zaokrúhľovanie na centy", () => {
    const s = stavUhradyPrijatej({ amount_total: 0.3, uhrady: [u(0.1), u(0.2)] });
    expect(s.zostava).toBe(0);
    expect(s.stav).toBe("uhradena");
  });
});

describe("dniPoSplatnosti", () => {
  const dnes = new Date(2026, 9, 28);
  it("po splatnosti, v deň splatnosti, pred splatnosťou", () => {
    expect(dniPoSplatnosti("2026-10-14", dnes)).toBe(14);
    expect(dniPoSplatnosti("2026-10-28", dnes)).toBe(0);
    expect(dniPoSplatnosti("2026-11-04", dnes)).toBe(-7);
  });
  it("cez prechod na zimný čas a cez rok", () => {
    expect(dniPoSplatnosti("2026-10-24", new Date(2026, 9, 26))).toBe(2);
    expect(dniPoSplatnosti("2025-12-31", new Date(2026, 0, 1))).toBe(1);
  });
  it("bez splatnosti", () => {
    expect(dniPoSplatnosti(null, dnes)).toBeNull();
    expect(dniPoSplatnosti("", dnes)).toBeNull();
  });
});

describe("zostaneKUhrade", () => {
  it("odpočíta aktuálnu úhradu, nikdy nie pod nulu", () => {
    expect(zostaneKUhrade(98.4, "50,40")).toBe(48);
    expect(zostaneKUhrade(10, 25)).toBe(0);
    expect(zostaneKUhrade(10, "")).toBe(10);
  });
});

describe("sumarPoSadzbach", () => {
  it("všetky sadzby krajiny aj nulové riadky", () => {
    const s = sumarPoSadzbach([{ sadzba: 23, zaklad: 80, dph: 18.4 }], [23, 19, 5]);
    expect(s.riadky.map((r) => r.sadzba)).toEqual([23, 19, 5, 0]);
    expect(s.riadky[0]).toMatchObject({ zaklad: 80, dph: 18.4, spolu: 98.4 });
    expect(s.riadky[1]).toMatchObject({ zaklad: 0, dph: 0, spolu: 0 });
    expect(s).toMatchObject({ zaklad: 80, dph: 18.4, spolu: 98.4 });
  });
  it("české sadzby a neznáma stará sadzba", () => {
    const s = sumarPoSadzbach(
      [
        { sadzba: 21, zaklad: 100, dph: 21 },
        { sadzba: 20, zaklad: 10, dph: 2 },
        { sadzba: 21, zaklad: 50, dph: 10.5 },
      ],
      [21, 12],
    );
    expect(s.riadky.map((r) => r.sadzba)).toEqual([21, 20, 12, 0]);
    expect(s.riadky[0]).toMatchObject({ zaklad: 150, dph: 31.5, spolu: 181.5 });
    expect(s.spolu).toBe(193.5);
  });
  it("prenesenie daňovej povinnosti ide do vlastného riadku", () => {
    const s = sumarPoSadzbach(
      [
        { sadzba: 23, zaklad: 100, dph: 23 },
        { sadzba: 23, zaklad: 50, dph: 0, pdp: true },
      ],
      [23],
    );
    expect(s.riadky.filter((r) => r.sadzba === 23)).toHaveLength(2);
    expect(s.riadky.find((r) => r.pdp)).toMatchObject({ zaklad: 50, dph: 0 });
  });
});

describe("typPrijatejFaktury", () => {
  it("tuzemská, zahraničná, záloha, dobropis", () => {
    expect(typPrijatejFaktury({ type: "regular", supplier_country: "SK" })).toBe(
      "Prijatá faktúra – tuzemská",
    );
    expect(typPrijatejFaktury({ type: "regular", supplier_country: "DE" })).toBe(
      "Prijatá faktúra – zahraničná",
    );
    expect(typPrijatejFaktury({ type: "regular" })).toBe("Prijatá faktúra – tuzemská");
    expect(typPrijatejFaktury({ type: "proforma" })).toBe("Prijatá zálohová faktúra – tuzemská");
    expect(typPrijatejFaktury({ type: "regular", amount_total: -10 })).toBe(
      "Prijatý dobropis – tuzemský",
    );
    expect(typPrijatejFaktury({ type: "regular", supplier_country: "CZ" }, "CZ")).toBe(
      "Prijatá faktúra – tuzemská",
    );
    expect(typPrijatejFaktury({ type: "regular", dph_rezim: "nadobudnutie" })).toBe(
      "Prijatá faktúra – zahraničná",
    );
  });
});
