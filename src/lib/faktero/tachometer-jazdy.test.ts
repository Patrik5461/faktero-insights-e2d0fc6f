import { describe, it, expect } from "vitest";
import { tachometerGpsJazdy } from "./tachometer-jazdy";

describe("tachometerGpsJazdy (J-05)", () => {
  it("nadviaže na koniec poslednej jazdy", () => {
    expect(tachometerGpsJazdy("144234.48", 142908, 24.62)).toEqual({
      start_odometer: 144234.48,
      end_odometer: 144259.1,
    });
  });
  it("bez jázd začne počiatočným stavom vozidla", () => {
    expect(tachometerGpsJazdy(null, "142908.00", 61.99)).toEqual({
      start_odometer: 142908,
      end_odometer: 142969.99,
    });
  });
  it("vozidlo bez stavu tachometra začne od nuly", () => {
    expect(tachometerGpsJazdy(undefined, null, 2.78)).toEqual({
      start_odometer: 0,
      end_odometer: 2.78,
    });
  });
});
