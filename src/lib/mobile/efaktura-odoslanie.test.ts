import { describe, expect, it } from "vitest";
import {
  dovodBezServera,
  jeOdoslana,
  klucStavu,
  vyhodnotPripravu,
  type PripravaEfaktury,
} from "./efaktura-odoslanie";
import { sk } from "./preklady/sk";

const zaklad: PripravaEfaktury = {
  aktivovana: true,
  testovaci: false,
  dorucenie: null,
  kontrola: { mozno: true, chyby: [], varovania: [] },
};

describe("odoslanie eFaktúry z appky", () => {
  it("bez servera: storno sa skryje, zálohová a koncept povedia prečo", () => {
    expect(dovodBezServera({ status: "cancelled", type: "regular" })).toEqual({
      kluc: "efo.posli.stornovana",
      skryt: true,
    });
    expect(dovodBezServera({ status: "issued", type: "proforma" })?.kluc).toBe(
      "efo.posli.zalohova",
    );
    expect(dovodBezServera({ status: "draft", type: "regular" })?.kluc).toBe("efo.posli.koncept");
    expect(dovodBezServera({ status: "issued", type: "regular" })).toBeNull();
    expect(dovodBezServera({ status: "paid", type: "credit_note" })).toBeNull();
  });

  it("zálohová má tú istú vetu ako web", () => {
    expect(sk["efo.posli.zalohova"]).toContain("Zálohová faktúra nie je daňový doklad");
  });

  it("firma bez aktivovanej eFaktúry ide na web", () => {
    expect(vyhodnotPripravu({ ...zaklad, aktivovana: false, kontrola: null })).toEqual({
      druh: "neaktivna",
    });
  });

  it("doklad, ktorý sa poslať nedá, nesie dôvod zo servera", () => {
    const dovod = "Odberateľ nemá DIČ ani IČ DPH — bez nich sa eFaktúra nemá kam poslať.";
    expect(vyhodnotPripravu({ ...zaklad, kontrola: { nedaSa: dovod } })).toEqual({
      druh: "nedaSa",
      dovod,
    });
  });

  it("chyby kontroly odoslanie zablokujú, varovania nie", () => {
    const chyby = { mozno: false, chyby: [{ kod: "BR-06", text: "x" }], varovania: [] };
    expect(vyhodnotPripravu({ ...zaklad, kontrola: chyby }).druh).toBe("chyby");
    const varovania = { mozno: true, chyby: [], varovania: [{ kod: "BR-X", text: "y" }] };
    expect(vyhodnotPripravu({ ...zaklad, kontrola: varovania })).toMatchObject({
      druh: "mozno",
      znova: false,
    });
  });

  it("už odoslanú ponúkne poslať znova, zlyhanú nie ako opakovanie", () => {
    const sent = { status: "sent", sent_at: "2026-10-31T10:00:00Z", delivered_at: null };
    expect(vyhodnotPripravu({ ...zaklad, dorucenie: sent })).toMatchObject({ znova: true });
    expect(jeOdoslana({ ...sent, status: "failed" })).toBe(false);
    expect(jeOdoslana({ ...sent, status: "rejected" })).toBe(false);
    expect(jeOdoslana(null)).toBe(false);
  });

  it("stav doručenia sa mapuje rovnako ako na serveri", () => {
    expect(klucStavu("in_transit")).toBe("efo.posli.stav.odoslana");
    expect(klucStavu("delivered")).toBe("efo.posli.stav.dorucena");
    expect(klucStavu("ERROR")).toBe("efo.posli.stav.zlyhala");
    expect(klucStavu("niečo")).toBeNull();
  });
});
