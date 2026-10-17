import { describe, expect, it } from "vitest";
import { suctyZm, zmNaCsv, zostavZm, HRANICA_STVRTROCNEJ_ZM } from "./zm";
import type { Vstup, VystavenaFaktura } from "./dph-vykazy";

function vstup(vystavene: VystavenaFaktura[]): Vstup {
  return { obdobie: { rok: 2026, stvrtrok: 4 }, vystavene, prijate: [], doklady: [] };
}
const eu = (x: Partial<VystavenaFaktura>): VystavenaFaktura => ({
  cislo: "RE-1",
  typ: "regular",
  datumDodania: "2026-10-05",
  odberatelIcDph: "ATU12345678",
  prenosDane: true,
  prenosTyp: "eu_b2b",
  euPlnenie: "tovar",
  riadky: [{ sadzba: 0, zaklad: 1000.99, dan: 0 }],
  ...x,
});

describe("Zusammenfassende Meldung", () => {
  it("sčíta po odberateľovi a druhu, sumy v celých eurách", () => {
    const z = zostavZm(
      vstup([
        eu({}),
        eu({ cislo: "RE-2", riadky: [{ sadzba: 0, zaklad: 500.5, dan: 0 }] }),
        eu({
          cislo: "RE-3",
          euPlnenie: "trojstranny",
          riadky: [{ sadzba: 0, zaklad: 300, dan: 0 }],
        }),
        eu({
          cislo: "RE-4",
          euPlnenie: "sluzba",
          odberatelIcDph: "FR12345678901",
          riadky: [{ sadzba: 0, zaklad: 200.99, dan: 0 }],
        }),
      ]),
      { rok: 2026, mesiac: 10 },
      { sluzbyMesacne: true },
    );
    expect(z.riadky).toEqual([
      expect.objectContaining({ krajina: "AT", ustIdNr: "U12345678", druh: "D", suma: 300 }),
      expect.objectContaining({
        krajina: "AT",
        ustIdNr: "U12345678",
        druh: "L",
        suma: 1501,
        dokladov: 2,
      }),
      expect.objectContaining({ krajina: "FR", ustIdNr: "12345678901", druh: "S", suma: 200 }),
    ]);
    expect(suctyZm(z.riadky)).toEqual({ L: 1501, D: 300, S: 200 });
  });

  it("dobropis znižuje súčet odberateľa, samotný dobropis dá záporný riadok", () => {
    const z = zostavZm(
      vstup([
        eu({}),
        eu({ cislo: "GS-1", typ: "credit_note", riadky: [{ sadzba: 0, zaklad: -200, dan: 0 }] }),
        eu({
          cislo: "GS-2",
          typ: "credit_note",
          odberatelIcDph: "NL123456789B01",
          riadky: [{ sadzba: 0, zaklad: -99.5, dan: 0 }],
        }),
      ]),
      { rok: 2026, stvrtrok: 4 },
    );
    expect(z.riadky.find((r) => r.krajina === "AT")?.suma).toBe(800);
    expect(z.riadky.find((r) => r.krajina === "NL")?.suma).toBe(-99);
    expect(z.vytky.some((v) => v.text.includes("Záporný"))).toBe(true);
  });

  it("odberateľ bez platného USt-IdNr. ide do výhrad, nie do riadkov", () => {
    const z = zostavZm(
      vstup([
        eu({ odberatelIcDph: null }),
        eu({ cislo: "RE-2", odberatelIcDph: "DE123456789" }),
        eu({ cislo: "RE-3", odberatelIcDph: "US123456" }),
      ]),
      { rok: 2026, stvrtrok: 4 },
    );
    expect(z.riadky).toHaveLength(0);
    expect(z.vytky.map((v) => v.doklad)).toEqual(["RE-1", "RE-2", "RE-3"]);
  });

  it("Grécko sa hlási pod EL, tuzemské a OSS faktúry ani zálohové sa nehlásia", () => {
    const z = zostavZm(
      vstup([
        eu({ odberatelIcDph: "GR123456789" }),
        eu({ cislo: "T-1", prenosDane: false, prenosTyp: null }),
        eu({ cislo: "OSS-1", oss: true }),
        eu({ cislo: "ZF-1", typ: "proforma" }),
      ]),
      { rok: 2026, stvrtrok: 4 },
    );
    expect(z.riadky).toEqual([expect.objectContaining({ krajina: "EL", ustIdNr: "123456789" })]);
  });

  it("mesačná ZM: tovar za mesiac, služby až v poslednom mesiaci štvrťroka", () => {
    const doklady = [
      eu({ datumDodania: "2026-10-05" }),
      eu({ cislo: "RE-2", datumDodania: "2026-11-05" }),
      eu({ cislo: "S-1", euPlnenie: "sluzba", datumDodania: "2026-10-20" }),
      eu({ cislo: "S-2", euPlnenie: "sluzba", datumDodania: "2026-12-01" }),
    ];
    const okt = zostavZm(vstup(doklady), { rok: 2026, mesiac: 10 });
    expect(okt.riadky.map((r) => r.druh)).toEqual(["L"]);
    expect(okt.sluzbyOdlozene).toBe(1);

    const dec = zostavZm(vstup(doklady), { rok: 2026, mesiac: 12 });
    expect(dec.riadky).toEqual([expect.objectContaining({ druh: "S", suma: 2001, dokladov: 2 })]);

    // Firma hlási služby mesačne (§ 18a Abs. 3).
    const oktM = zostavZm(vstup(doklady), { rok: 2026, mesiac: 10 }, { sluzbyMesacne: true });
    expect(oktM.riadky.map((r) => r.druh)).toEqual(["L", "S"]);
  });

  it("hranica 50 000 € za štvrťrok počíta tovar a trojstranný obchod, nie služby", () => {
    const z = zostavZm(
      vstup([
        eu({ riadky: [{ sadzba: 0, zaklad: 30_000, dan: 0 }] }),
        eu({
          cislo: "RE-2",
          datumDodania: "2026-11-02",
          euPlnenie: "trojstranny",
          riadky: [{ sadzba: 0, zaklad: 20_000.01, dan: 0 }],
        }),
        eu({ cislo: "S-1", euPlnenie: "sluzba", riadky: [{ sadzba: 0, zaklad: 90_000, dan: 0 }] }),
      ]),
      { rok: 2026, mesiac: 10 },
    );
    expect(z.tovarZaStvrtrok).toBe(50_000.01);
    expect(z.tovarZaStvrtrok > HRANICA_STVRTROCNEJ_ZM).toBe(true);
    expect(z.nadHranicou).toBe(true);
  });

  it("CSV podľa importu BZSt: verzia, hlavička, riadky bez kódu v USt-IdNr.", () => {
    const z = zostavZm(
      vstup([
        eu({}),
        eu({ cislo: "S", euPlnenie: "sluzba", riadky: [{ sadzba: 0, zaklad: -10, dan: 0 }] }),
      ]),
      {
        rok: 2026,
        stvrtrok: 4,
      },
    );
    const [csv, ...dalsie] = zmNaCsv(z.riadky);
    expect(dalsie).toHaveLength(0);
    expect(csv).toBe(
      "#v1.0\r\nLaenderkennzeichen,USt-IdNr.,Betrag(EUR),Art der Leistung\r\nAT,U12345678,1000,L\r\nAT,U12345678,-10,S\r\n",
    );
    expect(csv).not.toMatch(/\r\n\r\n/);
  });

  it("nad 1000 riadkov rozdelí CSV na viac súborov", () => {
    const riadky = Array.from({ length: 1001 }, (_, i) => ({
      krajina: "AT",
      ustIdNr: `U${String(i).padStart(8, "0")}`,
      druh: "L" as const,
      suma: 1,
      dokladov: 1,
    }));
    const subory = zmNaCsv(riadky);
    expect(subory).toHaveLength(2);
    expect(subory[1].trim().split("\r\n")).toHaveLength(3);
    expect(zmNaCsv([])).toEqual([]);
  });
});
