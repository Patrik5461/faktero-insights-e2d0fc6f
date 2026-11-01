import { describe, expect, it } from "vitest";
import {
  apiStatistika,
  dsoPrehladu,
  metrikyPrehladu,
  miestnyDatum,
  normalizujPrehlad,
  pocetBezPrepoctu,
  PRAZDNY_PREHLAD,
  sucetPrehladu,
  udalostiFaktury,
} from "./prehlad-suhrn";

describe("prehľad zo súhrnu databázy", () => {
  it("prázdna alebo chybná odpoveď dá nuly, nie NaN", () => {
    for (const d of [null, undefined, {}, "x"]) {
      const s = normalizujPrehlad(d);
      expect(s.mesiac_obrat).toBe(0);
      expect(s.vek_pohladavok).toHaveLength(5);
      expect(s.vyhlad).toHaveLength(4);
      expect(s.priemer_dni_uhrady).toBeNull();
    }
    expect(metrikyPrehladu(PRAZDNY_PREHLAD).monthRevenueDelta).toBe(0);
    expect(apiStatistika(PRAZDNY_PREHLAD).successRate).toBe(100);
  });

  it("numeric z PostgREST (text) prevedie na čísla", () => {
    const s = normalizujPrehlad({
      mesiac_obrat: "120.50",
      minuly_obrat: 100,
      stavy: { paid: "4", overdue: 1 },
      dlznici: [{ meno: null, suma: "12.3" }],
      vek_pohladavok: [{ pocet: 1, suma: "2.5" }],
    });
    expect(s.mesiac_obrat).toBe(120.5);
    expect(s.stavy).toEqual({ paid: 4, overdue: 1 });
    expect(s.dlznici).toEqual([{ meno: "", suma: 12.3 }]);
    expect(s.vek_pohladavok[0]).toEqual({ pocet: 1, suma: 2.5 });
    expect(s.vek_pohladavok[4]).toEqual({ pocet: 0, suma: 0 });
    expect(metrikyPrehladu(s).monthRevenueDelta).toBeCloseTo(20.5);
  });

  it("DSO a úspešnosť API", () => {
    const s = normalizujPrehlad({
      neuhradene_suma: 100,
      trzby_365: 365,
      api_mesiac: 4,
      api_uspesne: 3,
    });
    expect(dsoPrehladu(s).days).toBeCloseTo(100);
    expect(apiStatistika(s).successRate).toBe(75);
    expect(dsoPrehladu(normalizujPrehlad({ neuhradene_suma: 5 })).days).toBe(0);
  });

  it("dnešok je miestny dátum", () => {
    expect(miestnyDatum(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("S-03: dlžníci po splatnosti zvlášť od všetkých dlžníkov", () => {
    const s = normalizujPrehlad({ dlznikov: 6, dlznikov_po_splatnosti: "5" });
    expect(metrikyPrehladu(s).debtorCount).toBe(6);
    expect(metrikyPrehladu(s).overdueDebtorCount).toBe(5);
    expect(PRAZDNY_PREHLAD.dlznikov_po_splatnosti).toBe(0);
  });

  it("S-02: cudzia mena bez kurzu ostane mimo súčtu, po menách", () => {
    const s = normalizujPrehlad({
      neuhradene_suma: 100,
      prepocitane: true,
      bez_prepoctu: {
        faktury: 1,
        prijate: 2,
        blocky: 0,
        pohladavky: { USD: "30.5" },
        zavazky: { PLN: 10, CZK: 0 },
      },
    });
    expect(pocetBezPrepoctu(s)).toBe(3);
    const p = sucetPrehladu(s.neuhradene_suma, s, "EUR", "pohladavky");
    expect(p).toEqual({
      domaca: "EUR",
      suma: 100,
      prepocitane: true,
      bezPrepoctu: new Map([["USD", 30.5]]),
    });
    // Nulové meny sa vynechajú.
    expect([...sucetPrehladu(1, s, "EUR", "zavazky").bezPrepoctu.keys()]).toEqual(["PLN"]);
    expect(sucetPrehladu(1, s, "EUR").bezPrepoctu.size).toBe(0);
    // Starý tvar odpovede (pred migráciou) nič nerozbije.
    const stary = normalizujPrehlad({ neuhradene_suma: 5 });
    expect(stary.prepocitane).toBe(false);
    expect(pocetBezPrepoctu(stary)).toBe(0);
  });

  it("S-11: výdavky roka nesú aj bločky", () => {
    const s = normalizujPrehlad({ vydavky_rok: "152702.34", vydavky_blocky_rok: 17856.24 });
    expect(metrikyPrehladu(s).yearExpenses).toBe(152702.34);
    expect(s.vydavky_blocky_rok).toBe(17856.24);
  });

  it("S-07: odoslanie a storno majú vlastný čas, bez neho sa neukážu", () => {
    const c = "2026-10-01T08:00:00Z";
    expect(
      udalostiFaktury({ status: "sent", created_at: c, sent_at: "2026-10-02T09:00:00Z" }),
    ).toEqual([
      { druh: "vytvorena", cas: c },
      { druh: "odoslana", cas: "2026-10-02T09:00:00Z" },
    ]);
    expect(
      udalostiFaktury({ status: "sent", created_at: c, sent_at: null }).map((u) => u.druh),
    ).toEqual(["vytvorena"]);
    expect(
      udalostiFaktury({
        status: "cancelled",
        created_at: c,
        cancelled_at: "2026-10-05T10:00:00Z",
      }).at(-1),
    ).toEqual({ druh: "stornovana", cas: "2026-10-05T10:00:00Z" });
    expect(udalostiFaktury({ status: "cancelled", created_at: c }).map((u) => u.druh)).toEqual([
      "vytvorena",
    ]);
  });
});
