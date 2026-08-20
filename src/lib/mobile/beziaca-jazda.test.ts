/**
 * `beziacaJazda()` — čo appka ukazuje v pruhu „Nahrávam jazdu".
 *
 * Podstatná je tu jedna vec, ktorá sa ľahko prehliadne: `activeTrip` ostáva
 * v plugine vyplnené aj po skončení jazdy, kým si ju appka neprevezme. Bez
 * kontroly `endedAt` by pruh svietil ešte dlho po príchode.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getState = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true },
}));

vi.mock("@faktero/drive-detector", () => ({ DriveDetector: { getState } }));

const jazda = (zmeny: Record<string, unknown> = {}) => ({
  id: "t1",
  startedAt: 1_787_000_000_000,
  endedAt: null,
  points: [],
  distanceMeters: 12_400,
  maxSpeedKmh: 90,
  avgSpeedKmh: 60,
  classification: null,
  manual: false,
  ...zmeny,
});

async function beziaca() {
  const { beziacaJazda } = await import("./auto-jazdy-sync");
  return beziacaJazda();
}

describe("beziaca jazda", () => {
  beforeEach(() => {
    vi.resetModules();
    getState.mockReset();
  });

  it("bežiacu jazdu prepíše na to, čo obrazovka potrebuje", async () => {
    getState.mockResolvedValue({ monitoring: true, activeTrip: jazda() });
    expect(await beziaca()).toEqual({
      id: "t1",
      zaciatok: 1_787_000_000_000,
      km: 12.4,
      rucna: false,
    });
  });

  it("skončená jazda sa už za bežiacu nepovažuje", async () => {
    getState.mockResolvedValue({
      monitoring: true,
      activeTrip: jazda({ endedAt: 1_787_000_600_000 }),
    });
    expect(await beziaca()).toBeNull();
  });

  it("bez jazdy aj pri páde pluginu vráti nič", async () => {
    getState.mockResolvedValue({ monitoring: true, activeTrip: null });
    expect(await beziaca()).toBeNull();

    getState.mockRejectedValue(new Error("plugin nedostupný"));
    expect(await beziaca()).toBeNull();
  });

  it("ručne spustenú jazdu odlíši", async () => {
    getState.mockResolvedValue({ monitoring: true, activeTrip: jazda({ manual: true }) });
    expect((await beziaca())?.rucna).toBe(true);
  });
});
