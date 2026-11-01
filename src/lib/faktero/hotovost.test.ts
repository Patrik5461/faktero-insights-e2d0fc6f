import { describe, expect, it } from "vitest";
import {
  jeHotovost,
  prekrocenyStrop,
  prekrocenyStropHotovosti,
  rozdielZaokruhlenia,
  zaokruhlenieDokladu,
  zaokruhliHotovost,
  zaokruhliNaPatCentov,
  zaokruhlujeHotovost,
} from "./hotovost";

describe("zaokrúhlenie hotovosti", () => {
  it("zaokrúhľuje na päť centov", () => {
    expect(zaokruhliNaPatCentov(12.32)).toBe(12.3);
    expect(zaokruhliNaPatCentov(12.33)).toBe(12.35);
    expect(zaokruhliNaPatCentov(12.38)).toBe(12.4);
    expect(zaokruhliNaPatCentov(12.35)).toBe(12.35);
  });

  it("rozdiel je najviac dva centy a má správne znamienko", () => {
    expect(rozdielZaokruhlenia(12.32)).toBe(-0.02);
    expect(rozdielZaokruhlenia(12.33)).toBe(0.02);
    expect(rozdielZaokruhlenia(12.35)).toBe(0);
  });

  it("nezmysel nezhodí výpočet", () => {
    expect(zaokruhliNaPatCentov(Number.NaN)).toBe(0);
  });
});

describe("spôsob platby a strop", () => {
  it("hotovosť sa pozná aj zo starších zápisov", () => {
    expect(jeHotovost("cash")).toBe(true);
    expect(jeHotovost("hotovost")).toBe(true);
    expect(jeHotovost("bank_transfer")).toBe(false);
  });

  it("nad 5 000 € v hotovosti sa ozve, prevod nie", () => {
    expect(prekrocenyStrop(5000, "cash")).toBeNull();
    expect(prekrocenyStrop(5000.01, "cash")).toMatch(/zakázaná/);
    expect(prekrocenyStrop(20000, "bank_transfer")).toBeNull();
  });
});


describe("hotovosť podľa krajiny a meny (C-10, C-11)", () => {
  it("SK eurá na 0,05, CZ koruny na celé, DE a cudzia mena nie", () => {
    expect(zaokruhlujeHotovost("SK", "EUR")).toBe(true);
    expect(zaokruhlujeHotovost("SK", "CZK")).toBe(false);
    expect(zaokruhlujeHotovost("CZ", "CZK")).toBe(true);
    expect(zaokruhlujeHotovost("CZ", "EUR")).toBe(false);
    expect(zaokruhlujeHotovost("DE", "EUR")).toBe(false);
  });

  it("prepnutie spôsobu zaokrúhlenia pri hotovosti", () => {
    expect(zaokruhlenieDokladu("per_document", "cash", "SK", "EUR")).toBe("retail");
    expect(zaokruhlenieDokladu("per_document", "cash", "CZ", "CZK")).toBe("retail");
    expect(zaokruhlenieDokladu("per_document", "cash", "DE", "EUR")).toBe("per_document");
    expect(zaokruhlenieDokladu("per_document", "cash", "CZ", "EUR")).toBe("per_document");
    // Odchod z hotovosti vráti „retail“ späť, ručné „po položkách“ ostane.
    expect(zaokruhlenieDokladu("retail", "bank_transfer", "SK", "EUR")).toBe("per_document");
    expect(zaokruhlenieDokladu("per_item", "bank_transfer", "SK", "EUR")).toBe("per_item");
    // Hotovosť v mene, ktorá sa nezaokrúhľuje, zruší „retail“.
    expect(zaokruhlenieDokladu("retail", "cash", "CZ", "EUR")).toBe("per_document");
  });

  it("zaokrúhlenie sumy krokom meny", () => {
    expect(zaokruhliHotovost(12.33, "EUR")).toBe(12.35);
    expect(zaokruhliHotovost(2.525, "EUR")).toBe(zaokruhliNaPatCentov(2.525));
    expect(zaokruhliHotovost(121.49, "CZK")).toBe(121);
    expect(zaokruhliHotovost(121.5, "CZK")).toBe(122);
  });

  it("strop: SK 5 000 €, CZ 270 000 Kč, DE nič, cudzia mena bez kurzu nič", () => {
    expect(prekrocenyStropHotovosti(5000.01, "cash", { krajina: "SK", mena: "EUR" })?.parametre.strop).toBe(
      (5000).toLocaleString("sk-SK"),
    );
    expect(prekrocenyStropHotovosti(10000, "cash", { krajina: "SK", mena: "CZK" })).toBeNull();
    expect(prekrocenyStropHotovosti(10000, "cash", { krajina: "CZ", mena: "CZK" })).toBeNull();
    expect(prekrocenyStropHotovosti(270000.01, "cash", { krajina: "CZ", mena: "CZK" })?.kluc).toMatch(/254\/2004/);
    expect(prekrocenyStropHotovosti(1_000_000, "cash", { krajina: "DE", mena: "EUR" })).toBeNull();
    expect(prekrocenyStropHotovosti(9000, "cash", { krajina: "CZ", mena: "EUR", sumaDomaca: 300000 })?.kluc).toMatch(
      /Kč/,
    );
    expect(prekrocenyStropHotovosti(9000, "bank_transfer", { krajina: "SK", mena: "EUR" })).toBeNull();
  });
});
