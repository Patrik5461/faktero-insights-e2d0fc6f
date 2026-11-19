import { describe, expect, it } from "vitest";
import {
  hladajPrijateDobropisy,
  jePrijatyDobropis,
  smerDobropisov,
  sumaPrijatehoDobropisu,
} from "./prijate-dobropisy";
import { activeChildKey, NAV } from "@/components/faktero/nav";

describe("prijaté dobropisy", () => {
  it("pozná dobropis podľa zápornej sumy alebo opravovaného čísla", () => {
    expect(jePrijatyDobropis({ type: "regular", amount_total: -12.3, opravuje_cislo: "NK1" })).toBe(true);
    expect(jePrijatyDobropis({ type: "regular", amount_total: "-5", opravuje_cislo: null })).toBe(true);
    // Kladný s opravovaným číslom (napr. § 25a, ťarcha) — dobropis podľa typPrijatej.
    expect(jePrijatyDobropis({ type: "regular", amount_total: 1.23, opravuje_cislo: "20260006" })).toBe(true);
    expect(jePrijatyDobropis({ type: "regular", amount_total: 100, opravuje_cislo: "  " })).toBe(false);
    expect(jePrijatyDobropis({ type: "regular", amount_total: 100, opravuje_cislo: null })).toBe(false);
    // Zálohová ani daňový doklad k platbe dobropisom nie sú ani so zápornou sumou.
    expect(jePrijatyDobropis({ type: "proforma", amount_total: -10 })).toBe(false);
    expect(jePrijatyDobropis({ type: "advance_payment", amount_total: -10 })).toBe(false);
    expect(jePrijatyDobropis(null)).toBe(false);
  });

  it("sumu ukáže kladne, kladne uložený nechá", () => {
    expect(sumaPrijatehoDobropisu({ amount_total: -12.3 })).toBe(12.3);
    expect(sumaPrijatehoDobropisu({ amount_total: "-5.00" })).toBe(5);
    expect(sumaPrijatehoDobropisu({ amount_total: 1.23 })).toBe(1.23);
    expect(Object.is(sumaPrijatehoDobropisu({ amount_total: 0 }), 0)).toBe(true);
  });

  it("karta z adresy", () => {
    expect(smerDobropisov("prijate")).toBe("prijate");
    expect(smerDobropisov(" Prijate ")).toBe("prijate");
    expect(smerDobropisov("prijaté")).toBe("prijate");
    expect(smerDobropisov("vydane")).toBeUndefined();
    expect(smerDobropisov(1)).toBeUndefined();
    expect(smerDobropisov(undefined)).toBeUndefined();
  });

  it("hľadá v čísle, dodávateľovi, IČO aj opravovanom čísle", () => {
    const r = [
      { id: "a", invoice_number: "D1", supplier_name: "Orange", supplier_ico: "123", opravuje_cislo: "F9" },
      { id: "b", invoice_number: "D2", supplier_name: "Telekom", supplier_ico: "456", opravuje_cislo: null },
    ];
    expect(hladajPrijateDobropisy(r, "")).toHaveLength(2);
    expect(hladajPrijateDobropisy(r, "orange").map((x) => x.id)).toEqual(["a"]);
    expect(hladajPrijateDobropisy(r, "456").map((x) => x.id)).toEqual(["b"]);
    expect(hladajPrijateDobropisy(r, "f9").map((x) => x.id)).toEqual(["a"]);
  });

  it("v menu svieti Dobropisy aj na karte Prijaté", () => {
    const deti = NAV.flatMap((g: any) => g.children ?? []);
    const s = deti.filter((c: any) => c.to === "/faktury");
    expect(activeChildKey(s, "/faktury", { type: "credit", smer: "prijate" })).toBe("/fakturyDobropisy");
    expect(activeChildKey(s, "/faktury", { type: "credit" })).toBe("/fakturyDobropisy");
  });
});
