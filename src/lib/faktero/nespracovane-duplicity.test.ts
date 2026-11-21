import { describe, expect, it } from "vitest";
import { klucUdajov, najdiDuplicityNespracovanych, type NespracovanyNaDuplicity } from "./nespracovane-duplicity";

const n = (id: string, cas: string, x: Partial<NespracovanyNaDuplicity> = {}): NespracovanyNaDuplicity => ({
  id,
  vytvorene: cas,
  hash: null,
  ico: null,
  cislo: null,
  suma: null,
  popis: id,
  ...x,
});

describe("duplicity nespracovaných", () => {
  it("kľúč IČO + číslo + suma vyžaduje všetky tri a ignoruje medzery", () => {
    expect(klucUdajov({ ico: "36 123 456", cislo: "fa 2026/1", suma: 12.3 })).toBe("36123456|FA2026/1|1230");
    expect(klucUdajov({ ico: "36123456", cislo: "", suma: 12 })).toBeNull();
    expect(klucUdajov({ ico: "36123456", cislo: "1", suma: null })).toBeNull();
  });

  it("rovnaký súbor medzi nespracovanými — ostáva najstarší", () => {
    const r = najdiDuplicityNespracovanych(
      [n("b", "2026-11-02", { hash: "h" }), n("a", "2026-11-01", { hash: "h" }), n("c", "2026-11-03", { hash: "h" })],
      [],
    );
    expect(r.map((d) => [d.id, d.povod.id, d.podla])).toEqual([
      ["b", "a", "subor"],
      ["c", "a", "subor"],
    ]);
  });

  it("rovnaké IČO + číslo + suma medzi nespracovanými", () => {
    const r = najdiDuplicityNespracovanych(
      [
        n("a", "2026-11-01", { ico: "1", cislo: "F1", suma: 10 }),
        n("b", "2026-11-02", { ico: "1", cislo: "f1", suma: 10 }),
        n("c", "2026-11-03", { ico: "1", cislo: "F1", suma: 11 }),
      ],
      [],
    );
    expect(r.map((d) => [d.id, d.povod.id, d.podla])).toEqual([["b", "a", "udaje"]]);
  });

  it("už existujúci doklad má prednosť — aj najstarší nespracovaný ide preč", () => {
    const r = najdiDuplicityNespracovanych(
      [n("a", "2026-11-01", { hash: "h" }), n("b", "2026-11-02", { ico: "1", cislo: "F1", suma: 10 })],
      [
        { agenda: "prijata", id: "p", hash: "h", ico: null, cislo: null, suma: null, popis: "FA 1" },
        { agenda: "blocek", id: "e", hash: null, ico: "1", cislo: "F1", suma: 10, popis: "Bloček" },
      ],
    );
    expect(r.map((d) => [d.id, d.povod.agenda, d.povod.id, d.podla])).toEqual([
      ["a", "prijata", "p", "subor"],
      ["b", "blocek", "e", "udaje"],
    ]);
  });

  it("bez zhody nič", () => {
    expect(najdiDuplicityNespracovanych([n("a", "1", { hash: "x" }), n("b", "2", { hash: "y" })], [])).toEqual([]);
  });
});
