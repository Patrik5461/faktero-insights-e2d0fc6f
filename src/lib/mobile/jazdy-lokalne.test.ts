import { describe, expect, it } from "vitest";
import { zoradJazdy, type LokalnaJazda } from "./jazdy-lokalne";

function jazda(id: string, datum: string, caka = false): LokalnaJazda {
  return {
    id,
    company_id: "f1",
    vehicle_id: "v1",
    trip_date: datum,
    distance_km: 10,
    caka,
  };
}

describe("poradie jázd na obrazovke", () => {
  it("čakajúce sú hore, nech je vidieť, že sa nestratili", () => {
    const zoradene = zoradJazdy([
      jazda("a", "2026-08-14"),
      jazda("caka", "2026-08-01", true),
      jazda("b", "2026-08-13"),
    ]);
    expect(zoradene.map((j) => j.id)).toEqual(["caka", "a", "b"]);
  });

  it("zvyšok ide od najnovšej", () => {
    const zoradene = zoradJazdy([
      jazda("stara", "2026-07-01"),
      jazda("nova", "2026-08-14"),
      jazda("stredna", "2026-08-01"),
    ]);
    expect(zoradene.map((j) => j.id)).toEqual(["nova", "stredna", "stara"]);
  });

  it("viac čakajúcich sa medzi sebou zoradí tiež podľa dátumu", () => {
    const zoradene = zoradJazdy([
      jazda("c1", "2026-08-01", true),
      jazda("hotova", "2026-08-14"),
      jazda("c2", "2026-08-10", true),
    ]);
    expect(zoradene.map((j) => j.id)).toEqual(["c2", "c1", "hotova"]);
  });

  it("pôvodné pole sa nemení", () => {
    const vstup = [jazda("a", "2026-08-01"), jazda("b", "2026-08-14")];
    zoradJazdy(vstup);
    expect(vstup.map((j) => j.id)).toEqual(["a", "b"]);
  });
});
