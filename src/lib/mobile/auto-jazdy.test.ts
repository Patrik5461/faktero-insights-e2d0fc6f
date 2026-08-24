import { describe, expect, it } from "vitest";
import type { BufferedTrip } from "@faktero/drive-detector";
import {
  cakaNaCloveka,
  jePrikratka,
  miestnyDatum,
  prekazkaDetekcie,
  riadokZJazdy,
} from "./auto-jazdy";
import { dekoduj } from "@/lib/faktero/polyline";

function jazda(zmeny: Partial<BufferedTrip> = {}): BufferedTrip {
  const zaciatok = new Date("2026-08-13T08:00:00+02:00").getTime();
  return {
    id: "abc-123",
    startedAt: zaciatok,
    endedAt: zaciatok + 30 * 60 * 1000,
    points: [
      { lat: 48.15, lng: 17.11, speedKmh: 60, accuracy: 8, altitude: 150, timestamp: zaciatok },
      {
        lat: 48.2,
        lng: 17.2,
        speedKmh: 88,
        accuracy: 8,
        altitude: 160,
        timestamp: zaciatok + 1000,
      },
    ],
    distanceMeters: 45_000,
    maxSpeedKmh: 88.4,
    avgSpeedKmh: 90,
    classification: null,
    manual: false,
    ...zmeny,
  };
}

describe("riadok knihy jázd z rozpoznanej jazdy", () => {
  it("prepíše metre na kilometre a doplní časy", () => {
    const r = riadokZJazdy({
      jazda: jazda(),
      companyId: "firma-1",
      vehicleId: "auto-1",
      classification: "business",
    });

    expect(r.distance_km).toBe(45);
    expect(r.end_odometer).toBe(45);
    expect(r.start_odometer).toBe(0);
    expect(r.duration_seconds).toBe(1800);
    expect(r.average_speed_kmh).toBe(90);
    expect(r.purpose).toBe("Automaticky rozpoznaná jazda");
    expect(r.classification).toBe("business");
  });

  it("súkromná jazda má vlastný účel", () => {
    const r = riadokZJazdy({
      jazda: jazda(),
      companyId: "firma-1",
      vehicleId: "auto-1",
      classification: "private",
    });
    expect(r.classification).toBe("private");
    expect(r.purpose).toBe("Súkromná jazda");
  });

  it("nesie zdroj a identifikátor kvôli opakovanému prevzatiu", () => {
    // Na dvojici stojí jedinečný index — bez nej by druhý pokus o uloženie
    // vyrobil v knihe jázd duplicitu.
    const r = riadokZJazdy({
      jazda: jazda({ id: "jazda-xyz" }),
      companyId: "firma-1",
      vehicleId: "auto-1",
      classification: "business",
    });
    expect(r.external_source).toBe("drive_detector");
    expect(r.external_id).toBe("jazda-xyz");
  });

  it("nesie prejdenú trasu", () => {
    const r = riadokZJazdy({
      jazda: jazda(),
      companyId: "f",
      vehicleId: "a",
      classification: "business",
    });
    expect(dekoduj(r.route)).toHaveLength(2);
  });

  it("jazda bez použiteľnej trasy má stĺpec prázdny", () => {
    const r = riadokZJazdy({
      jazda: jazda({ points: [] }),
      companyId: "f",
      vehicleId: "a",
      classification: "business",
    });
    expect(r.route).toBeNull();
  });

  it("spotrebu počíta len keď ju vozidlo má", () => {
    const bez = riadokZJazdy({
      jazda: jazda(),
      companyId: "f",
      vehicleId: "a",
      classification: "business",
    });
    expect(bez.fuel_consumption).toBeNull();

    const s = riadokZJazdy({
      jazda: jazda(),
      companyId: "f",
      vehicleId: "a",
      classification: "business",
      spotrebaL100: 6.5,
      cenaPaliva: 1.559,
    });
    // 45 km pri 6,5 l/100 km
    expect(s.fuel_consumption).toBeCloseTo(2.93, 2);
    expect(s.fuel_price).toBe(1.559);
  });

  it("nedokončená jazda nemá koniec ani záporné trvanie", () => {
    const r = riadokZJazdy({
      jazda: jazda({ endedAt: null }),
      companyId: "f",
      vehicleId: "a",
      classification: "business",
    });
    expect(r.end_time).toBeNull();
    expect(r.duration_seconds).toBe(0);
  });
});

describe("dátum jazdy", () => {
  it("berie miestny deň, nie ten podľa UTC", () => {
    // Pol hodiny po miestnej polnoci je podľa UTC u nás ešte predošlý deň —
    // dátum z `toISOString()` by jazdu zapísal do zlého dňa. Čas sa preto
    // skladá v miestnom pásme, nech test platí na telefóne aj na serveri.
    const polnoc = new Date(2026, 7, 14, 0, 30).getTime();
    expect(miestnyDatum(polnoc)).toBe("2026-08-14");
  });

  it("zvládne aj posledný deň mesiaca", () => {
    expect(miestnyDatum(new Date(2026, 0, 31, 23, 45).getTime())).toBe("2026-01-31");
  });
});

describe("čo sa nemá ukladať", () => {
  it("popojdenie po parkovisku sa zahodí", () => {
    expect(jePrikratka(jazda({ distanceMeters: 120 }))).toBe(true);
    expect(jePrikratka(jazda({ distanceMeters: 4_000 }))).toBe(false);
  });

  it("jazda bez zaradenia čaká na človeka", () => {
    expect(cakaNaCloveka(jazda())).toBe(true);
    expect(cakaNaCloveka(jazda({ classification: "business" }))).toBe(false);
  });
});

describe("prečo detekcia nebeží", () => {
  it("povolená poloha „Vždy“ a presná poloha znamenajú, že jej nič nebráni", () => {
    expect(
      prekazkaDetekcie({ location: "granted", background: "granted", precise: "granted" }),
    ).toBeNull();
  });

  it("zakázaná poloha je prvá prekážka", () => {
    expect(prekazkaDetekcie({ location: "denied", background: "denied" })).toBe("poloha");
  });

  // Toto je ten prípad, ktorý appka celý čas hlásila ako „zapnuté“: iOS
  // odpoveď na „Vždy“ odloží a ostane „Počas používania".
  it("poloha len počas používania sa nepovažuje za zapnutú detekciu", () => {
    expect(prekazkaDetekcie({ location: "granted", background: "prompt" })).toBe("pozadie");
  });

  it("znížená presnosť je prekážka aj s povolením „Vždy“", () => {
    expect(
      prekazkaDetekcie({ location: "granted", background: "granted", precise: "denied" }),
    ).toBe("presnost");
  });

  it("staršia binárka bez údaja o presnosti sa neposudzuje", () => {
    expect(prekazkaDetekcie({ location: "granted", background: "granted" })).toBeNull();
  });
});
