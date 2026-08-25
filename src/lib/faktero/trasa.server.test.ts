import { describe, it, expect } from "vitest";
import { chybaSluzby, miestoZOdpovede, navrhyZOdpovede, trasaZOdpovede } from "./trasa.server";

describe("návrh trasy", () => {
  it("z odpovede spraví kilometre na desatiny a celé minúty", () => {
    const v = trasaZOdpovede({
      routes: [{ geometry: "abcd", summary: { distance: 46_320, duration: 2_040 } }],
    });
    expect(v.vzdialenost_km).toBe(46.3);
    expect(v.trvanie_min).toBe(34);
    expect(v.route).toBe("abcd");
  });

  it("odpoveď bez trasy nevydá za nulovú jazdu", () => {
    // Nula kilometrov by sa v knihe jázd tvárila ako platný záznam.
    expect(() => trasaZOdpovede({ routes: [] })).toThrow(/nenašla cesta/);
    expect(() => trasaZOdpovede({})).toThrow(/nenašla cesta/);
  });

  it("nenájdená adresa povie, ktorá to bola", () => {
    expect(() => miestoZOdpovede({ features: [] }, "Kdesi 12")).toThrow(/Kdesi 12/);
  });

  it("z nájdenej adresy vezme súradnice v poradí, v akom chodia", () => {
    // GeoJSON má [dĺžka, šírka] — prehodené by to hodilo trasu do Somálska.
    const m = miestoZOdpovede(
      {
        features: [{ properties: { label: "Trnava" }, geometry: { coordinates: [17.58, 48.37] } }],
      },
      "Trnava",
    );
    expect(m.lat).toBe(48.37);
    expect(m.lng).toBe(17.58);
    expect(m.nazov).toBe("Trnava");
  });

  it("napovedanie nevráti tú istú adresu dvakrát", () => {
    const von = navrhyZOdpovede({
      features: [
        { properties: { label: "Hlavná, Trnava, Slovensko" } },
        { properties: { label: "Hlavná, Trnava, Slovensko" } },
        { properties: { label: "Hlavná, Nitra, Slovensko" } },
        { properties: {} },
      ],
    });
    expect(von).toEqual(["Hlavná, Trnava, Slovensko", "Hlavná, Nitra, Slovensko"]);
  });

  it("prázdna odpoveď napovedania nie je chyba", () => {
    expect(navrhyZOdpovede({})).toEqual([]);
    expect(navrhyZOdpovede({ features: [] })).toEqual([]);
  });

  it("chyby služby majú vetu, nie len číslo", () => {
    expect(chybaSluzby(401)).toMatch(/neplatí/);
    expect(chybaSluzby(429)).toMatch(/limit/);
    expect(chybaSluzby(503)).toMatch(/503/);
  });
});
