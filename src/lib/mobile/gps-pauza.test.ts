/**
 * Pauza v meraní jazdy.
 *
 * Ani natívny plugin, ani prehliadač pauzu nevedia — meranie sa dá len spustiť
 * a ukončiť. Pauza je preto ukončenie úseku a jeho odloženie bokom. Práve tam
 * sa dá ľahko stratiť to, čo bolo namerané pred ňou, alebo naopak započítať
 * cestu, ktorú človek prešiel počas prestávky. Oboje sa na telefóne overuje
 * ťažko, tak je to tu.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false },
}));

/** Body, ktoré „prehliadač" nahlási po spustení sledovania. */
let davka: { lat: number; lng: number }[] = [];
let hlas: ((p: unknown) => void) | null = null;
/*
  Vlastné hodiny, nie `Date.now()`.

  Tracker zahadzuje úseky nad 250 km/h ako skok GPS. Dva body 1,1 km od seba
  s časom z `Date.now()` sú od seba nula alebo jednu milisekundu — teda buď
  „bez času" (a započítajú sa), alebo štyri milióny km/h (a zahodia sa).
  Test tak prechádzal len vtedy, keď obe volania padli do tej istej
  milisekundy, čo je zhruba raz z pätnástich behov.
*/
const KROK_MS = 60_000;
let cas = 0;

beforeEach(() => {
  davka = [];
  hlas = null;
  cas = Date.UTC(2026, 7, 25, 8, 0, 0);
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

/** Nahlási jeden bod tak, ako to robí prehliadač — vždy o minútu neskôr. */
function poloha(lat: number, lng: number) {
  davka.push({ lat, lng });
  cas += KROK_MS;
  hlas?.({ coords: { latitude: lat, longitude: lng }, timestamp: cas });
}

async function tracker() {
  vi.resetModules();
  return await import("./gps-tracker");
}

describe("pauza v meraní jazdy", () => {
  it("po pauze sa namerané nestratí a stojace auto sa nezapočíta", async () => {
    const t = await tracker();
    expect((await t.startTracking()).ok).toBe(true);

    // Prvý úsek — zhruba 1,1 km na sever.
    poloha(48.37, 17.58);
    poloha(48.38, 17.58);
    const poPrvom = t.getCurrentDistanceKm();
    expect(poPrvom).toBeGreaterThan(1);

    const naPauze = await t.pauseTracking();
    expect(t.isPaused()).toBe(true);
    expect(t.isTracking()).toBe(false);
    // Počítadlo po pauze nesmie spadnúť na nulu — to je celá pointa.
    expect(naPauze).toBeCloseTo(poPrvom, 1);

    // Kým je pauza, poloha sa nesleduje: ďalšie „body" nemá kto prijať.
    expect(t.getCurrentDistanceKm()).toBeCloseTo(poPrvom, 1);

    expect((await t.resumeTracking()).ok).toBe(true);
    expect(t.isPaused()).toBe(false);
    poloha(48.38, 17.58);
    poloha(48.39, 17.58);

    const vysledok = await t.stopTracking();
    // Súčet oboch úsekov, nie len toho posledného.
    expect(vysledok.distance_km).toBeGreaterThan(poPrvom * 1.8);
    expect(vysledok.points.length).toBe(4);
    expect(t.isPaused()).toBe(false);
    expect(t.isTracking()).toBe(false);
  });

  it("nová jazda nezdedí úseky z predchádzajúcej", async () => {
    const t = await tracker();
    await t.startTracking();
    poloha(48.37, 17.58);
    poloha(48.38, 17.58);
    await t.pauseTracking();
    await t.stopTracking();

    await t.startTracking();
    expect(t.getCurrentDistanceKm()).toBe(0);
    const prazdna = await t.stopTracking();
    expect(prazdna.distance_km).toBe(0);
    expect(prazdna.points).toEqual([]);
  });

  it("ukončenie počas pauzy uloží to, čo sa nameralo pred ňou", async () => {
    const t = await tracker();
    await t.startTracking();
    poloha(48.37, 17.58);
    poloha(48.38, 17.58);
    const pred = t.getCurrentDistanceKm();
    await t.pauseTracking();

    const vysledok = await t.stopTracking();
    expect(vysledok.distance_km).toBeCloseTo(pred, 1);
    expect(vysledok.points.length).toBe(2);
  });
});
