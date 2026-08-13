import { describe, expect, it } from "vitest";
import { naPixely, ohranicenie, vyberZoom } from "./mapa-obrazok";

describe("prepočet súradníc na pixely", () => {
  it("nula stupňov je stred sveta", () => {
    const p = naPixely({ lat: 0, lng: 0 }, 0);
    expect(p.x).toBeCloseTo(128, 5);
    expect(p.y).toBeCloseTo(128, 5);
  });

  it("každé priblíženie zdvojnásobí mierku", () => {
    const a = naPixely({ lat: 48.15, lng: 17.11 }, 10);
    const b = naPixely({ lat: 48.15, lng: 17.11 }, 11);
    expect(b.x).toBeCloseTo(a.x * 2, 5);
    expect(b.y).toBeCloseTo(a.y * 2, 5);
  });

  it("na sever je menšie y, na východ väčšie x", () => {
    const bratislava = naPixely({ lat: 48.15, lng: 17.11 }, 12);
    const kosice = naPixely({ lat: 48.72, lng: 21.26 }, 12);
    expect(kosice.x).toBeGreaterThan(bratislava.x);
    expect(kosice.y).toBeLessThan(bratislava.y);
  });
});

describe("ohraničenie trasy", () => {
  it("nájde krajné body", () => {
    const o = ohranicenie([
      { lat: 48.15, lng: 17.11 },
      { lat: 48.72, lng: 21.26 },
      { lat: 48.3, lng: 17.5 },
    ]);
    expect(o).toEqual({ minLat: 48.15, maxLat: 48.72, minLng: 17.11, maxLng: 21.26 });
  });
});

describe("výber priblíženia", () => {
  const sirka = 640;
  const vyska = 380;

  it("krátka trasa sa priblíži viac než dlhá", () => {
    const kratka = [
      { lat: 48.148, lng: 17.107 },
      { lat: 48.152, lng: 17.112 },
    ];
    const dlha = [
      { lat: 48.148, lng: 17.107 },
      { lat: 48.72, lng: 21.26 },
    ];
    expect(vyberZoom(kratka, sirka, vyska)).toBeGreaterThan(vyberZoom(dlha, sirka, vyska));
  });

  it("celá trasa sa do obrázka zmestí", () => {
    const body = [
      { lat: 48.148, lng: 17.107 },
      { lat: 48.377, lng: 17.587 },
    ];
    const z = vyberZoom(body, sirka, vyska);
    const a = naPixely({ lat: 48.377, lng: 17.107 }, z);
    const b = naPixely({ lat: 48.148, lng: 17.587 }, z);

    expect(Math.abs(b.x - a.x)).toBeLessThanOrEqual(sirka);
    expect(Math.abs(b.y - a.y)).toBeLessThanOrEqual(vyska);
  });

  it("jeden bod sa nepokúša ohraničiť", () => {
    expect(vyberZoom([{ lat: 48.15, lng: 17.11 }], sirka, vyska)).toBe(17);
  });
});
