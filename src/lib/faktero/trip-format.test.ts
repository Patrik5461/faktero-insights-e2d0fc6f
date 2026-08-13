import { describe, expect, it } from "vitest";
import {
  charakterJazdy,
  formatDuration,
  formatSpeed,
  jeSukromna,
  sourceLabel,
} from "./trip-format";

describe("popis jazdy", () => {
  it("pozná zdroje jázd", () => {
    expect(sourceLabel(null)).toBe("Manuálne");
    expect(sourceLabel("commander")).toBe("Commander GPS");
    expect(sourceLabel("drive_detector")).toBe("Automatická detekcia");
  });

  it("staré jazdy bez zaradenia sú služobné", () => {
    // Stĺpec pribudol až s automatickou detekciou, doterajšie jazdy sú
    // služobné — nič iné sa do knihy jázd doteraz nezapisovalo.
    expect(charakterJazdy(null)).toBe("Služobná");
    expect(charakterJazdy("business")).toBe("Služobná");
    expect(charakterJazdy("private")).toBe("Súkromná");
    expect(jeSukromna(null)).toBe(false);
    expect(jeSukromna("private")).toBe(true);
  });

  it("trvanie a rýchlosť znesú prázdne hodnoty", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(5400)).toBe("1 h 30 min");
    expect(formatSpeed(45, 1800, null)).toBe("90 km/h");
    expect(formatSpeed(45, null, null)).toBe("—");
  });
});
