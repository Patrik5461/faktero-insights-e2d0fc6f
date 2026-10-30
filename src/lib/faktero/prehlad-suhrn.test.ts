import { describe, expect, it } from "vitest";
import {
  apiStatistika,
  dsoPrehladu,
  metrikyPrehladu,
  miestnyDatum,
  normalizujPrehlad,
  PRAZDNY_PREHLAD,
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
});
