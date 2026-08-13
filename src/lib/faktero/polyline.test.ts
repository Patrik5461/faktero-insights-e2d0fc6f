import { describe, expect, it } from "vitest";
import { dekoduj, MAX_BODOV, prerieduj, trasaDoPolyline, zakoduj } from "./polyline";

describe("kódovanie trasy", () => {
  it("sedí so známym príkladom", () => {
    // Referenčná trojica z popisu formátu — keby sme si kódovanie vymysleli
    // po svojom, mapa by trasu prečítala inak.
    const body = [
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ];
    expect(zakoduj(body)).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });

  it("prečíta späť, čo zakódovalo", () => {
    const body = [
      { lat: 48.1486, lng: 17.1077 },
      { lat: 48.1512, lng: 17.1123 },
      { lat: 48.3774, lng: 17.5872 },
    ];
    const naspat = dekoduj(zakoduj(body));
    expect(naspat).toHaveLength(3);
    naspat.forEach((b, i) => {
      expect(b.lat).toBeCloseTo(body[i]!.lat, 5);
      expect(b.lng).toBeCloseTo(body[i]!.lng, 5);
    });
  });

  it("zvládne aj južnú a západnú pologuľu", () => {
    const body = [
      { lat: -33.8688, lng: 151.2093 },
      { lat: -34.0, lng: 150.9 },
    ];
    const naspat = dekoduj(zakoduj(body));
    expect(naspat[0]!.lat).toBeCloseTo(-33.8688, 5);
    expect(naspat[1]!.lng).toBeCloseTo(150.9, 5);
  });

  it("prázdny vstup nikoho nezhodí", () => {
    expect(zakoduj([])).toBe("");
    expect(dekoduj("")).toEqual([]);
    expect(dekoduj(null)).toEqual([]);
  });
});

describe("preriedenie dlhej trasy", () => {
  function trasa(pocet: number) {
    return Array.from({ length: pocet }, (_, i) => ({ lat: 48 + i / 10000, lng: 17 }));
  }

  it("kratšiu trasu necháva tak", () => {
    const body = trasa(120);
    expect(prerieduj(body)).toHaveLength(120);
  });

  it("dlhšiu skráti a nechá začiatok aj koniec", () => {
    const body = trasa(MAX_BODOV * 3);
    const out = prerieduj(body);

    expect(out.length).toBeLessThanOrEqual(MAX_BODOV + 1);
    expect(out[0]).toEqual(body[0]);
    expect(out[out.length - 1]).toEqual(body[body.length - 1]);
  });
});

describe("trasa do stĺpca", () => {
  it("jazda s jedným bodom trasu nemá", () => {
    // Zapísať prázdny reťazec do stĺpca je pasca — v mape by to vyzeralo,
    // že trasa existuje, len je pokazená.
    expect(trasaDoPolyline([{ lat: 48.15, lng: 17.11 }])).toBeNull();
    expect(trasaDoPolyline([])).toBeNull();
    expect(trasaDoPolyline(null)).toBeNull();
  });

  it("z dvoch bodov už trasa je", () => {
    const out = trasaDoPolyline([
      { lat: 48.15, lng: 17.11 },
      { lat: 48.16, lng: 17.12 },
    ]);
    expect(out).toBeTruthy();
    expect(dekoduj(out)).toHaveLength(2);
  });
});
