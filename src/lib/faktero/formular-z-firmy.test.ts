import { describe, expect, it } from "vitest";
import { otlacok, predvoleneZFirmy } from "./formular-z-firmy";
import { nastaveniaExportu } from "./export-nastavenia";

describe("otlacok", () => {
  it("nezávisí od poradia kľúčov", () => {
    expect(otlacok({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(
      otlacok({ b: { d: [1, 2], c: 2 }, a: 1 }),
    );
  });
  it("rozlíši iný obsah", () => {
    expect(otlacok({ a: 1 })).not.toBe(otlacok({ a: 2 }));
    expect(otlacok([1, 2])).not.toBe(otlacok([2, 1]));
  });
});

describe("E-22: uloženie jednej karty neprepíše druhú", () => {
  const firma = {
    id: "f1",
    pohoda_pokladna: "HP",
    uctovanie_nastavenia: { export: { datumZapisu: "dodanie" } },
  };

  it("uloženie Predvolených (zmena nespracovaných aj pokladne) nemení otlačok exportu", () => {
    const poUlozeni = {
      ...firma,
      pohoda_pokladna: "HP2",
      uctovanie_nastavenia: { ...firma.uctovanie_nastavenia, nespracovane: { toleranciaCenty: 5 } },
    };
    expect(otlacok(nastaveniaExportu(poUlozeni.uctovanie_nastavenia))).toBe(
      otlacok(nastaveniaExportu(firma.uctovanie_nastavenia)),
    );
    expect(otlacok(predvoleneZFirmy(poUlozeni))).not.toBe(otlacok(predvoleneZFirmy(firma)));
  });

  it("uloženie Nastavení exportu nemení otlačok Predvolených", () => {
    const poUlozeni = {
      ...firma,
      uctovanie_nastavenia: { export: { datumZapisu: "vyhotovenie" } },
    };
    expect(otlacok(predvoleneZFirmy(poUlozeni))).toBe(otlacok(predvoleneZFirmy(firma)));
    expect(otlacok(nastaveniaExportu(poUlozeni.uctovanie_nastavenia))).not.toBe(
      otlacok(nastaveniaExportu(firma.uctovanie_nastavenia)),
    );
  });

  it("znovu načítaná firma s rovnakým obsahom (nový objekt) má rovnaký otlačok", () => {
    expect(otlacok(predvoleneZFirmy({ ...firma }))).toBe(otlacok(predvoleneZFirmy(firma)));
  });
});
