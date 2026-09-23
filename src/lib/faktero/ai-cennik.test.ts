import { describe, expect, it } from "vitest";
import {
  cenaVolania,
  cennikPre,
  denPred,
  NEZNAMY_MODEL,
  odDna,
  poDnoch,
  podla,
  spocitaj,
  type SuhrnRiadok,
} from "./ai-cennik";

function r(p: Partial<SuhrnRiadok>): SuhrnRiadok {
  return {
    den: "2026-09-23",
    poskytovatel: "gemini",
    model: "gemini-3.5-flash",
    ucel: "blocek",
    ok: true,
    volani: 1,
    vstup: 1000,
    vystup: 100,
    trvanie: 1000,
    ...p,
  };
}

describe("cena", () => {
  it("počíta sa zo sadzby za milión tokenov", () => {
    // 1 M vstupu po 0,30 a 1 M výstupu po 2,50
    expect(cenaVolania("gemini-3.5-flash", 1_000_000, 1_000_000)).toBeCloseTo(2.8, 6);
  });

  it("model mimo cenníka sa nezahodí, berie sa stredná sadzba", () => {
    expect(cennikPre("gpt-9-turbo")).toEqual(NEZNAMY_MODEL);
    expect(cenaVolania("gpt-9-turbo", 1_000_000, 0)).toBeCloseTo(NEZNAMY_MODEL.vstup, 6);
  });
});

describe("súčty", () => {
  it("zlyhané volania sa počítajú zvlášť, ale zo súčtu nevypadnú", () => {
    const s = spocitaj([r({ volani: 3 }), r({ ok: false, volani: 2 })]);
    expect(s.volani).toBe(5);
    expect(s.chyby).toBe(2);
  });

  it("zoskupenie dáva najdrahšie hore", () => {
    const skupiny = podla(
      [
        r({ ucel: "blocek", vstup: 1000, vystup: 10 }),
        r({ ucel: "asistent", model: "gpt-4o", vstup: 100_000, vystup: 10_000 }),
      ],
      (x) => x.ucel,
    );
    expect(skupiny[0].kluc).toBe("asistent");
  });
});

describe("obdobia", () => {
  it("dni bez volania v grafe nechýbajú", () => {
    const dni = poDnoch([r({ den: "2026-09-23", volani: 4 })], 3, new Date("2026-09-23T12:00:00"));
    expect(dni.map((d) => d.kluc)).toEqual(["2026-09-21", "2026-09-22", "2026-09-23"]);
    expect(dni.map((d) => d.volani)).toEqual([0, 0, 4]);
  });

  it("„posledných 7 dní“ berie aj dnešok", () => {
    const dnes = new Date("2026-09-23T12:00:00");
    expect(denPred(1, dnes)).toBe("2026-09-23");
    expect(denPred(7, dnes)).toBe("2026-09-17");
    const vybrane = odDna([r({ den: "2026-09-16" }), r({ den: "2026-09-17" })], denPred(7, dnes));
    expect(vybrane).toHaveLength(1);
  });
});
