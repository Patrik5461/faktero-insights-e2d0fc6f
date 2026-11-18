import { describe, expect, it } from "vitest";
import {
  PRAH_ZHODY,
  filtrujDoklady,
  najdiFirmu,
  obdobiaPreModel,
  obdobieMesiaca,
  skoreZhody,
  type RiadokHladania,
} from "./hlas-hladanie";

describe("hlas — tolerantné porovnanie mien", () => {
  it("bez diakritiky, bez právnej formy, časť mena", () => {
    expect(skoreZhody("orange", "Orange Slovensko, a.s.")).toBe(1);
    expect(skoreZhody("Slovak telekom", "Slovak Telekom, a.s.")).toBe(1);
    expect(skoreZhody("zavar", "ZAVAR GROUP s.r.o.")).toBeGreaterThanOrEqual(PRAH_ZHODY);
    expect(skoreZhody("stavebniny dek", "Stavebniny DEK s.r.o.")).toBeGreaterThanOrEqual(
      PRAH_ZHODY,
    );
    expect(skoreZhody("slovnaft", "SLOVNAFT, a.s.")).toBe(1);
    expect(skoreZhody("telekom", "Slovak Telekom")).toBe(1);
    expect(skoreZhody("ovocinárstvo", "Ovocinarstvo Novak")).toBeGreaterThanOrEqual(PRAH_ZHODY);
  });

  it("odpustí chyby prepisu reči", () => {
    expect(skoreZhody("orendž", "Orange Slovensko")).toBeLessThan(PRAH_ZHODY); // fonetika sa nehádže
    expect(skoreZhody("oranže", "Orange Slovensko")).toBeGreaterThanOrEqual(PRAH_ZHODY);
    expect(skoreZhody("slovak telecom", "Slovak Telekom, a.s.")).toBeGreaterThanOrEqual(PRAH_ZHODY);
    expect(skoreZhody("alza", "Alza.cz a.s.")).toBeGreaterThanOrEqual(PRAH_ZHODY);
    expect(skoreZhody("kaufland", "Kaufland Slovenská republika v.o.s.")).toBeGreaterThanOrEqual(
      PRAH_ZHODY,
    );
  });

  it("cudzie meno nesedí", () => {
    expect(skoreZhody("orange", "Shell Slovakia")).toBeLessThan(PRAH_ZHODY);
    expect(skoreZhody("tesco", "Lidl")).toBeLessThan(PRAH_ZHODY);
    expect(skoreZhody("orange shell", "Orange Slovensko")).toBeLessThan(PRAH_ZHODY);
    expect(skoreZhody("", "Orange")).toBe(0);
  });
});

const r = (z: Partial<RiadokHladania> & { id: string }): RiadokHladania => ({
  cislo: null,
  partner: null,
  suma: null,
  mena: "EUR",
  datum: null,
  ...z,
});

describe("hlas — filter dokladov", () => {
  const dnes = "2026-11-18";
  const riadky = [
    r({
      id: "a",
      partner: "Orange Slovensko, a.s.",
      cislo: "FV2026/100",
      suma: 24.9,
      datum: "2026-10-05",
      splatnost: "2026-10-19",
      uhradena: false,
      zauctovana: true,
    }),
    r({
      id: "b",
      partner: "Orange Slovensko, a.s.",
      cislo: "FV2026/090",
      suma: 24.9,
      datum: "2026-09-05",
      uhradena: true,
      zauctovana: false,
    }),
    r({
      id: "c",
      partner: "Shell Slovakia",
      cislo: "555",
      vs: "20260555",
      suma: 120,
      datum: "2026-10-20",
      splatnost: "2026-12-01",
      uhradena: false,
      zauctovana: false,
    }),
    r({
      id: "d",
      partner: "Slovak Telekom",
      cislo: "777",
      suma: -30,
      datum: "2026-11-02",
      uhradena: null,
      zauctovana: false,
    }),
  ];
  const ids = (f: Parameters<typeof filtrujDoklady>[1]) =>
    filtrujDoklady(riadky, f, dnes).map((x) => x.id);

  it("partner + mesiac", () => {
    expect(ids({ partner: "orange" })).toEqual(["a", "b"]);
    expect(ids({ partner: "orange", datumOd: "2026-10-01", datumDo: "2026-10-31" })).toEqual(["a"]);
  });
  it("suma s toleranciou, aj dobropis v absolútnej hodnote", () => {
    expect(ids({ suma: 120 })).toEqual(["c"]);
    expect(ids({ suma: 119.6 })).toEqual(["c"]);
    expect(ids({ suma: 30 })).toEqual(["d"]);
    expect(ids({ suma: 100 })).toEqual([]);
  });
  it("číslo dokladu aj VS, bez lomiek a medzier", () => {
    expect(ids({ cislo: "2026 100" })).toEqual(["a"]);
    expect(ids({ cislo: "20260555" })).toEqual(["c"]);
    // Číslo povedané ako „partner“.
    expect(ids({ partner: "FV2026/090" })).toEqual(["b"]);
  });
  it("stav: neuhradené, po splatnosti, nezaúčtované", () => {
    expect(ids({ stav: "neuhradene" })).toEqual(["c", "a"]);
    expect(ids({ stav: "po_splatnosti" })).toEqual(["a"]);
    expect(ids({ stav: "nezauctovane" })).toEqual(["d", "c", "b"]);
  });
});

describe("hlas — obdobia pre model", () => {
  it("dnešok, tento a minulý mesiac, prechod cez január", () => {
    const t = obdobiaPreModel("2026-11-18");
    expect(t).toContain("Dnes je 2026-11-18 (streda)");
    expect(t).toContain("Minulý mesiac: 2026-10-01 až 2026-10-31");
    expect(obdobiaPreModel("2026-01-10")).toContain("Minulý mesiac: 2025-12-01 až 2025-12-31");
    expect(obdobieMesiaca(2024, 2)).toEqual({ od: "2024-02-01", do: "2024-02-29" });
  });
});

describe("hlas — výber firmy na prepnutie", () => {
  const firmy = [
    { id: "1", name: "Tobify s.r.o.", ico: "53111111" },
    { id: "2", name: "PALIERA s.r.o.", ico: "47222222" },
    { id: "3", name: "Test – PALIERA s.r.o.", ico: null, testovacia_pre: "2" },
    { id: "4", name: "Zavar Group a.s.", ico: "36333333" },
    { id: "5", name: "Novák stavby s.r.o.", ico: "1" },
    { id: "6", name: "Novák obchod s.r.o.", ico: "2" },
  ];
  it("názov bez diakritiky, časť názvu, IČO", () => {
    expect(najdiFirmu(firmy, "paliera").presna?.id).toBe("2");
    expect(najdiFirmu(firmy, "zavar").presna?.id).toBe("4");
    expect(najdiFirmu(firmy, "IČO 36 333 333").presna?.id).toBe("4");
    expect(najdiFirmu(firmy, "tobifi").presna?.id).toBe("1");
  });
  it("testovacia len na požiadanie", () => {
    expect(najdiFirmu(firmy, "testovaciu palieru").presna?.id).toBe("3");
    expect(najdiFirmu(firmy, "test paliera").presna?.id).toBe("3");
  });
  it("nejednoznačné a neznáme", () => {
    const r = najdiFirmu(firmy, "novak");
    expect(r.presna).toBeNull();
    expect(r.kandidati.map((f) => f.id).sort()).toEqual(["5", "6"]);
    expect(najdiFirmu(firmy, "novák stavby").presna?.id).toBe("5");
    expect(najdiFirmu(firmy, "microsoft")).toEqual({ presna: null, kandidati: [] });
  });
});
