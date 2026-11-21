import { describe, expect, it } from "vitest";
import {
  denNaFilter,
  druhNaFilter,
  moznostiNahral,
  sposobUhrady,
  vyhovujeFiltrom,
  type RiadokNaFilter,
} from "./nespracovane-filtre-zoznamu";

const faktura: RiadokNaFilter = {
  typ: "nespracovany",
  druh: "faktura",
  stav: "vytazene",
  datum: "2026-10-05",
  vytvorene: "2026-11-02T10:00:00Z",
  nahral: "u1",
  zdroj: "nahratie",
  uhradaFiltra: "prevod",
  navrhZauctovania: true,
};
const blocek: RiadokNaFilter = {
  typ: "blocek",
  druh: null,
  stav: "vytazene",
  datum: null,
  vytvorene: "2026-11-15T10:00:00Z",
  nahral: "u2",
  zdroj: "apka",
  uhradaFiltra: "hotovost",
  navrhZauctovania: false,
};
const zMailu: RiadokNaFilter = { ...faktura, druh: null, stav: "cita", zdroj: "mail", nahral: "u1" };

describe("filtre nespracovaných", () => {
  it("bez filtrov prejde všetko", () => {
    expect([faktura, blocek, zMailu].every((r) => vyhovujeFiltrom(r, {}))).toBe(true);
  });

  it("druh: bloček zo skenu je bloček, doklad bez druhu neurčený", () => {
    expect(druhNaFilter(blocek)).toBe("blocek");
    expect(druhNaFilter(zMailu)).toBe("neurceny");
    expect(vyhovujeFiltrom(blocek, { druh: "blocek" })).toBe(true);
    expect(vyhovujeFiltrom(faktura, { druh: "blocek" })).toBe(false);
    expect(vyhovujeFiltrom(zMailu, { druh: "neurceny" })).toBe(true);
  });

  it("úhrada a zaúčtovanie", () => {
    expect(vyhovujeFiltrom(blocek, { platba: "hotovost" })).toBe(true);
    expect(vyhovujeFiltrom(faktura, { platba: "hotovost" })).toBe(false);
    expect(vyhovujeFiltrom(faktura, { zauct: "ano" })).toBe(true);
    expect(vyhovujeFiltrom(faktura, { zauct: "nie" })).toBe(false);
    expect(vyhovujeFiltrom(blocek, { zauct: "nie" })).toBe(true);
  });

  it("stav čítania", () => {
    expect(vyhovujeFiltrom(zMailu, { citanie: "cita" })).toBe(true);
    expect(vyhovujeFiltrom(faktura, { citanie: "cita" })).toBe(false);
    expect(vyhovujeFiltrom({ ...faktura, stav: null }, { citanie: "vytazene" })).toBe(true);
  });

  it("nahral — mail sa nepočíta (created_by je majiteľ adresy)", () => {
    expect(vyhovujeFiltrom(faktura, { nahral: "u1" })).toBe(true);
    expect(vyhovujeFiltrom(zMailu, { nahral: "u1" })).toBe(false);
    expect(moznostiNahral([faktura, blocek, zMailu], { u1: "Ján", u2: "Anna" })).toEqual([
      { value: "u2", label: "Anna" },
      { value: "u1", label: "Ján" },
    ]);
  });

  it("obdobie podľa vystavenia, bez dátumu podľa nahratia; alebo podľa nahratia", () => {
    expect(denNaFilter(faktura, "vystavenie")).toBe("2026-10-05");
    expect(denNaFilter(blocek, "vystavenie")).toBe(denNaFilter(blocek, "nahratie"));
    expect(vyhovujeFiltrom(faktura, { od: "2026-10-01", do: "2026-10-31" })).toBe(true);
    expect(vyhovujeFiltrom(faktura, { od: "2026-10-01", do: "2026-10-31", podla: "nahratie" })).toBe(false);
    expect(vyhovujeFiltrom(faktura, { od: "2026-11-01", podla: "nahratie" })).toBe(true);
    expect(vyhovujeFiltrom(blocek, { od: "2026-11-01", do: "2026-11-30" })).toBe(true);
    expect(vyhovujeFiltrom({ ...blocek, vytvorene: null }, { od: "2026-11-01" })).toBe(false);
  });

  it("spôsob úhrady — uložený, inak z AI, cudzie hodnoty nie", () => {
    expect(sposobUhrady("", "Karta")).toBe("karta");
    expect(sposobUhrady("prevod", "hotovost")).toBe("prevod");
    expect(sposobUhrady("dobierka", null)).toBe(null);
  });
});
