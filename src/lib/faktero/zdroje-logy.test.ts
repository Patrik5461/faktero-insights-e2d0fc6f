import { describe, expect, it } from "vitest";
import {
  chybajuceDni,
  hraniceDna,
  podielDopocitaneho,
  spracujOdpovedLogov,
  suctyMesiaca,
  zobrazitEdgeFunkcie,
} from "./zdroje-logy";

// Podvrhnutá odpoveď v tvare, aký vrátilo API pre 29. 10. 2026 (skrátená).
const ODPOVED = {
  result: [
    {
      source: "edge_logs",
      sluzba: "storage",
      cache: "MISS",
      pocet: 880,
      s_dlzkou: 880,
      bajty: 1000,
    },
    { source: "edge_logs", sluzba: "rest", cache: "DYNAMIC", pocet: 100, s_dlzkou: 50, bajty: 500 },
    { source: "edge_logs", sluzba: "rest", cache: "", pocet: 20, s_dlzkou: 10, bajty: "100" },
    { source: "edge_logs", sluzba: "realtime", cache: "DYNAMIC", pocet: 69, s_dlzkou: 0, bajty: 0 },
    { source: "realtime_logs", sluzba: "", cache: "", pocet: 326, s_dlzkou: 0, bajty: 0 },
    { source: "function_edge_logs", sluzba: "", cache: "", pocet: 7, s_dlzkou: 0, bajty: 0 },
  ],
};

describe("zdroje-logy: odpoveď API", () => {
  it("spočíta egress, realtime a edge funkcie", () => {
    const d = spracujOdpovedLogov(ODPOVED);
    expect(d.realtime_messages).toBe(326);
    expect(d.edge_invocations).toBe(7);
    expect(d.responses_total).toBe(880 + 100 + 20 + 69);
    expect(d.responses_without_length).toBe(50 + 10 + 69);
    expect(d.egress_measured_bytes).toBe(1600);
    // rest: 60 odpovedí s dĺžkou, 600 B → priemer 10 B, chýba 60 → +600 B;
    // realtime nemá ani jednu zmeranú odpoveď, nedopočíta sa.
    expect(d.egress_bytes).toBe(2200);
    expect(d.detail).toHaveLength(6);
  });

  it("prázdny deň = nuly", () => {
    const d = spracujOdpovedLogov({ result: [] });
    expect(d.egress_bytes).toBe(0);
    expect(d.realtime_messages).toBe(0);
  });

  it("chyba dotazu alebo zlý tvar hodí výnimku, nič nevymýšľa", () => {
    expect(() => spracujOdpovedLogov({ error: { message: "Table x does not exist" } })).toThrow(
      /does not exist/,
    );
    expect(() => spracujOdpovedLogov({ error: "zle" })).toThrow(/zle/);
    expect(() => spracujOdpovedLogov({})).toThrow();
    expect(() => spracujOdpovedLogov(null)).toThrow();
  });

  it("záporné a nečíselné hodnoty berie ako 0", () => {
    const d = spracujOdpovedLogov({
      result: [
        { source: "realtime_logs", pocet: "x" },
        { source: "realtime_logs", pocet: -5 },
      ],
    });
    expect(d.realtime_messages).toBe(0);
  });
});

describe("zdroje-logy: dni", () => {
  it("hranice dňa do 24 h", () => {
    expect(hraniceDna("2026-10-29")).toEqual({
      start: "2026-10-29T00:00:00Z",
      end: "2026-10-29T23:59:59.999Z",
    });
  });

  it("chýbajúce dni od včera dozadu, bez dneška", () => {
    const teraz = new Date("2026-10-30T01:00:00Z");
    expect(chybajuceDni(teraz, [], 3)).toEqual(["2026-10-29", "2026-10-28", "2026-10-27"]);
    expect(chybajuceDni(teraz, ["2026-10-29", "2026-10-27"], 3)).toEqual(["2026-10-28"]);
    expect(chybajuceDni(teraz, ["2026-10-29", "2026-10-28", "2026-10-27"], 3)).toEqual([]);
  });
});

describe("zdroje-logy: súčty mesiaca", () => {
  const riadky = [
    { date: "2026-09-30", egress_bytes: 999, realtime_messages: 999, edge_invocations: 999 },
    {
      date: "2026-10-01",
      egress_bytes: 100,
      egress_measured_bytes: 80,
      responses_total: 10,
      responses_without_length: 2,
      realtime_messages: 5,
      edge_invocations: 0,
    },
    {
      date: "2026-10-29",
      egress_bytes: 300,
      egress_measured_bytes: 270,
      responses_total: 30,
      responses_without_length: 3,
      realtime_messages: 7,
      edge_invocations: 0,
    },
  ];

  it("sčíta len aktuálny kalendárny mesiac", () => {
    const s = suctyMesiaca(riadky, new Date("2026-10-30T10:00:00Z"));
    expect(s.od).toBe("2026-10-01");
    expect(s.do).toBe("2026-10-29");
    expect(s.dni).toBe(2);
    expect(s.egress_bytes).toBe(400);
    expect(s.egress_measured_bytes).toBe(350);
    expect(s.responses_without_length).toBe(5);
    expect(s.realtime_messages).toBe(12);
    expect(s.edge_invocations).toBe(0);
    expect(podielDopocitaneho(s)).toBeCloseTo(12.5);
  });

  it("nový mesiac bez dát", () => {
    const s = suctyMesiaca(riadky, new Date("2026-11-01T00:30:00Z"));
    expect(s.dni).toBe(0);
    expect(s.do).toBeNull();
    expect(podielDopocitaneho(s)).toBeNull();
  });
});

describe("zdroje-logy: karta edge funkcií", () => {
  it("skrytá pri nule funkcií, viditeľná pri aspoň jednej", () => {
    expect(zobrazitEdgeFunkcie(0, 0)).toBe(false);
    expect(zobrazitEdgeFunkcie(0, 12)).toBe(false);
    expect(zobrazitEdgeFunkcie(2, 0)).toBe(true);
  });
  it("bez počtu funkcií rozhodnú volania", () => {
    expect(zobrazitEdgeFunkcie(null, 0)).toBe(false);
    expect(zobrazitEdgeFunkcie(null, null)).toBe(false);
    expect(zobrazitEdgeFunkcie(null, 3)).toBe(true);
  });
});
