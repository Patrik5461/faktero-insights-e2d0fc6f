import { describe, expect, it } from "vitest";
import {
  charakterJazdy,
  ucelNaZobrazenie,
  formatDuration,
  formatSpeed,
  jeSukromna,
  jeSukromnaJazda,
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

  /*
    Súčty v prehľadoch sa opierali o dve rôzne pravdy: appka porovnávala
    `classification` s hodnotou „personal", ktorú nikto nezapisuje, a webový
    prehľad hľadal slovo „súkrom" v účele. Súkromná jazda tak v oboch končila
    medzi služobnými. Odteraz o tom rozhoduje jedna funkcia.
  */
  it("v súčtoch rozhoduje zaradenie, nie text v účele", () => {
    expect(jeSukromnaJazda({ classification: "private", purpose: "Návšteva" })).toBe(true);
    expect(jeSukromnaJazda({ classification: "business", purpose: "Rozvoz" })).toBe(false);

    // Jazda prepnutá na služobnú si nesie starý účel z automatickej detekcie.
    // Rozhodnutie človeka musí prebiť text, inak by sa vrátila medzi súkromné.
    expect(jeSukromnaJazda({ classification: "business", purpose: "Súkromná jazda" })).toBe(false);

    // Bez zaradenia — jazdy spred stĺpca. Tam ostáva jediným vodidlom účel.
    expect(jeSukromnaJazda({ classification: null, purpose: "Súkromná jazda" })).toBe(true);
    expect(jeSukromnaJazda({ classification: null, purpose: "Odvoz tovaru" })).toBe(false);
    expect(jeSukromnaJazda({})).toBe(false);
  });

  it("trvanie a rýchlosť znesú prázdne hodnoty", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(5400)).toBe("1 h 30 min");
    expect(formatSpeed(45, 1800, null)).toBe("90 km/h");
    expect(formatSpeed(45, null, null)).toBe("—");
  });
});

describe("ucelNaZobrazenie", () => {
  it("zástupné texty nezobrazuje", () => {
    expect(ucelNaZobrazenie("Automaticky rozpoznaná jazda", "business")).toBeNull();
    expect(ucelNaZobrazenie("Súkromná jazda", "private")).toBeNull();
    expect(ucelNaZobrazenie("Služobná cesta", "business")).toBeNull();
  });

  it("vlastný účel zobrazí", () => {
    expect(ucelNaZobrazenie("Servis u zákazníka", "business")).toBe("Servis u zákazníka");
  });

  it("prázdny účel je nič", () => {
    expect(ucelNaZobrazenie(null, "business")).toBeNull();
    expect(ucelNaZobrazenie("   ", "private")).toBeNull();
  });

  it("účel, ktorý je len zopakovaný charakter, zahodí", () => {
    expect(ucelNaZobrazenie("Súkromná", "private")).toBeNull();
    expect(ucelNaZobrazenie("služobná", "business")).toBeNull();
  });
});
