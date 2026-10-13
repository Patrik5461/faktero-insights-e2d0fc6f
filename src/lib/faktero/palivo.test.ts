import { describe, expect, it } from "vitest";
import { jePalivo } from "./palivo";

describe("jePalivo", () => {
  it.each([
    "MOTOROVÁ NAFTA",
    "Nafta",
    "Diesel",
    "EVO DIESEL",
    "NATURAL 95",
    "Nat.95",
    "BA 95",
    "Benzín 98",
    "LPG",
    "AdBlue 10l",
    "Shell V-Power Diesel",
    "MOL Dynamic Diesel",
    "OMV MaxxMotion 100",
    "VERVA ON",
    "Efecta Diesel",
  ])("palivo: %s", (n) => expect(jePalivo(n)).toBe(true));
  it.each([
    "Bageta šunková",
    "Káva espresso",
    "Umývanie Premium",
    "Motorový olej 5W30",
    "Ostrekovacia kvapalina",
    "Parkovné",
    "",
  ])("nie palivo: %s", (n) => expect(jePalivo(n)).toBe(false));
});
