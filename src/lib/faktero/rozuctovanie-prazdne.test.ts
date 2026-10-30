import { describe, expect, it } from "vitest";
import {
  bezPrazdnychRiadkov,
  chybaRozuctovania,
  jePrazdnyRiadok,
  nacitajRozuctovanie,
  ocisti,
  type RiadokRozuctovania,
} from "./rozuctovanie";

const rozpis = [{ sadzba: 23, zaklad: 100, dph: 23 }];
const riadok = (p: Partial<RiadokRozuctovania> = {}): RiadokRozuctovania => ({
  predkontacia: "1Pmat",
  clenenie: "PD",
  sadzba: 23,
  zaklad: 50,
  dph: 11.5,
  text: "",
  ...p,
});
// Riadok z tlačidla „Pridať riadok“, keď už nič neostáva rozúčtovať.
const prazdny = riadok({ predkontacia: "", clenenie: "PD", zaklad: 0, dph: 0 });

describe("prázdne riadky rozúčtovania", () => {
  it("prázdny je len riadok bez predkontácie s nulovým základom aj DPH", () => {
    expect(jePrazdnyRiadok(prazdny)).toBe(true);
    expect(jePrazdnyRiadok(riadok({ predkontacia: null, zaklad: 0.004, dph: 0 }))).toBe(true);
    expect(jePrazdnyRiadok(riadok({ zaklad: 0, dph: 0 }))).toBe(false); // má predkontáciu
    expect(jePrazdnyRiadok(riadok({ predkontacia: "  ", zaklad: 10, dph: 0 }))).toBe(false); // má sumu
    expect(jePrazdnyRiadok(riadok({ predkontacia: "", zaklad: 0, dph: 2.3 }))).toBe(false);
  });

  it("ocisti (uloženie na serveri) prázdny riadok zahodí a rozúčtovanie potom prejde kontrolou", () => {
    const riadky = [riadok(), riadok({ predkontacia: "1Prez" }), prazdny];
    const ulozit = ocisti(riadky);
    expect(ulozit).toHaveLength(2);
    expect(ulozit.map((r) => r.predkontacia)).toEqual(["1Pmat", "1Prez"]);
    expect(chybaRozuctovania(ulozit, rozpis)).toBeNull();
  });

  it("samé prázdne riadky = žiadne rozúčtovanie", () => {
    expect(ocisti([prazdny, { ...prazdny }])).toEqual([]);
    expect(bezPrazdnychRiadkov([prazdny])).toEqual([]);
  });

  it("staršie uložené rozúčtovanie s prázdnym riadkom sa načíta bez neho", () => {
    const nacitane = nacitajRozuctovanie([riadok(), riadok({ predkontacia: "1Prez" }), prazdny]);
    expect(nacitane).toHaveLength(2);
  });
});
