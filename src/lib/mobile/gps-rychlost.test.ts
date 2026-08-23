/**
 * Rýchlosť z GPS.
 *
 * Najvyššia rýchlosť sa počíta z trasy a práve to je miesto, kde GPS klame:
 * poloha občas skočí o stovky metrov a z dvoch bodov tesne za sebou vyjde
 * rýchlosť lietadla. Taká hodnota by v knihe jázd stála čierne na bielom, tak
 * je tu overené, že sa zahodí.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false },
}));

let hlas: ((p: unknown) => void) | null = null;

beforeEach(() => {
  hlas = null;
  vi.stubGlobal("navigator", {
    geolocation: {
      watchPosition: (ok: (p: unknown) => void) => {
        hlas = ok;
        return 1;
      },
      clearWatch: () => {},
    },
  });
});

/** Bod trasy s vlastnou časovou značkou — rýchlosť závisí od odstupu. */
function poloha(lat: number, ts: number) {
  hlas?.({ coords: { latitude: lat, longitude: 17.58 }, timestamp: ts });
}

async function tracker() {
  vi.resetModules();
  return await import("./gps-tracker");
}

const T0 = 1_787_000_000_000;

describe("rýchlosť jazdy", () => {
  it("spočíta priemer aj maximum", async () => {
    const t = await tracker();
    await t.startTracking();
    // ~1,11 km za 60 s = zhruba 67 km/h, potom ~1,11 km za 120 s = ~33 km/h.
    poloha(48.37, T0);
    poloha(48.38, T0 + 60_000);
    poloha(48.39, T0 + 180_000);

    const r = await t.stopTracking();
    expect(r.max_speed_kmh).toBeGreaterThan(60);
    expect(r.max_speed_kmh).toBeLessThan(75);
    // Priemer je nižší než maximum a vyšší než ten pomalší úsek.
    expect(r.avg_speed_kmh).toBeGreaterThan(30);
    expect(r.avg_speed_kmh).toBeLessThan(r.max_speed_kmh!);
  });

  it("zahodí skok polohy, ktorý by vyzeral ako lietadlo", async () => {
    const t = await tracker();
    await t.startTracking();
    poloha(48.37, T0);
    poloha(48.38, T0 + 60_000); // ~67 km/h
    poloha(49.5, T0 + 70_000); // skok o vyše 100 km za 10 s
    poloha(49.51, T0 + 130_000);

    const r = await t.stopTracking();
    // Skok sa do maxima nedostane; ostane rozumná hodnota z reálnych úsekov.
    expect(r.max_speed_kmh).toBeLessThan(250);
    expect(r.max_speed_kmh).toBeGreaterThan(0);
  });

  it("dva body tesne za sebou maximum neurčujú", async () => {
    const t = await tracker();
    await t.startTracking();
    poloha(48.37, T0);
    poloha(48.3701, T0 + 500); // pol sekundy — na výpočet primalý odstup
    poloha(48.38, T0 + 120_000);

    const r = await t.stopTracking();
    expect(r.max_speed_kmh).toBeLessThan(60);
  });

  it("skok polohy sa nezapočíta ani do kilometrov", async () => {
    const t = await tracker();
    await t.startTracking();
    poloha(48.37, T0);
    poloha(48.38, T0 + 60_000); // ~1,1 km riadnou rýchlosťou
    poloha(49.5, T0 + 70_000); // skok o vyše 100 km za 10 s
    poloha(49.51, T0 + 130_000); // ~1,1 km od miesta skoku

    const r = await t.stopTracking();
    // Bez filtra by tu bolo vyše 100 km — cesta, ktorú auto nikdy neprešlo.
    expect(r.distance_km).toBeLessThan(5);
    expect(r.distance_km).toBeGreaterThan(1.5);
    // Body ostávajú v trase; zahadzuje sa len započítanie úseku.
    expect(r.points.length).toBe(4);
  });

  it("bez trasy sa rýchlosť nevymýšľa", async () => {
    const t = await tracker();
    await t.startTracking();
    const r = await t.stopTracking();
    expect(r.max_speed_kmh).toBeNull();
    expect(r.avg_speed_kmh).toBeNull();
  });
});
