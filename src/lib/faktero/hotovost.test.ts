import { describe, expect, it } from "vitest";
import {
  jeHotovost,
  prekrocenyStrop,
  rozdielZaokruhlenia,
  zaokruhliNaPatCentov,
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
