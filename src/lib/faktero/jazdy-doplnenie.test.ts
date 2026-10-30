import { describe, expect, it, vi } from "vitest";

vi.mock("./geokodovanie.server", () => ({ adresaZBodu: vi.fn() }));

import { krajneBody, ostaneNedoplnena } from "./jazdy-doplnenie.server";

describe("ostaneNedoplnena", () => {
  const plna = { start_location: "A", end_location: "B", driver_name: "Jano" };

  it("úplne doplnená jazda nie je neúspešný pokus", () => {
    expect(ostaneNedoplnena({ ...plna, end_location: null }, { end_location: "B" })).toBe(false);
  });

  it("chýbajúca adresa po pokuse je neúspech", () => {
    expect(ostaneNedoplnena({ ...plna, end_location: null }, {})).toBe(true);
  });

  it("chýbajúci vodič po pokuse je neúspech", () => {
    expect(ostaneNedoplnena({ ...plna, driver_name: null }, { start_location: "C" })).toBe(true);
  });
});

describe("krajneBody", () => {
  it("bez trasy vezme súradnice od GPS poskytovateľa", () => {
    expect(krajneBody(null, { odLat: 48.1, odLng: 17.1, doLat: 48.2, doLng: 17.2 })).toEqual({
      prvy: { lat: 48.1, lng: 17.1 },
      posledny: { lat: 48.2, lng: 17.2 },
    });
  });
  it("neúplné súradnice = nič", () => {
    expect(krajneBody(null, { odLat: 48.1, odLng: null, doLat: 48.2, doLng: 17.2 })).toBeNull();
    expect(krajneBody(null, null)).toBeNull();
  });
});
