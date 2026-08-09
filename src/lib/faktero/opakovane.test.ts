import { describe, it, expect } from "vitest";
import { advanceNextRun, dniVMesiaci, pripocitajMesiace } from "./opakovane";

describe("dniVMesiaci", () => {
  it("pozná dĺžku mesiaca aj priestupný rok", () => {
    expect(dniVMesiaci(2026, 0)).toBe(31);
    expect(dniVMesiaci(2026, 1)).toBe(28);
    expect(dniVMesiaci(2028, 1)).toBe(29);
    expect(dniVMesiaci(2026, 3)).toBe(30);
  });
});

describe("pripocitajMesiace", () => {
  it("bežný posun", () => {
    expect(pripocitajMesiace("2026-03-15", 1)).toBe("2026-04-15");
    expect(pripocitajMesiace("2026-03-15", 3)).toBe("2026-06-15");
  });

  // Toto je chyba, kvôli ktorej modul vznikol: `setUTCMonth(+1)` spraví
  // z 31. januára 31. február, čo je 3. marec — mesačná faktúra by február
  // preskočila a odvtedy chodila 3. v mesiaci.
  it("koniec mesiaca sa oreže, nepretečie do ďalšieho", () => {
    expect(pripocitajMesiace("2026-01-31", 1)).toBe("2026-02-28");
    expect(pripocitajMesiace("2028-01-31", 1)).toBe("2028-02-29");
    expect(pripocitajMesiace("2026-03-31", 1)).toBe("2026-04-30");
    expect(pripocitajMesiace("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("prelom roka", () => {
    expect(pripocitajMesiace("2026-12-15", 1)).toBe("2027-01-15");
    expect(pripocitajMesiace("2026-10-31", 3)).toBe("2027-01-31");
    // 29. február existuje len v priestupnom roku; o rok neskôr sa oreže.
    expect(pripocitajMesiace("2028-02-29", 12)).toBe("2029-02-28");
  });

  it("nezmyselný dátum sa nezmení na Invalid Date", () => {
    expect(pripocitajMesiace("nezmysel", 1)).toBe("nezmysel");
  });
});

describe("advanceNextRun", () => {
  it("týždenne", () => {
    expect(advanceNextRun("2026-08-09", "weekly")).toBe("2026-08-16");
    expect(advanceNextRun("2026-12-28", "weekly")).toBe("2027-01-04");
  });

  it("mesačne, štvrťročne a ročne", () => {
    expect(advanceNextRun("2026-08-09", "monthly")).toBe("2026-09-09");
    expect(advanceNextRun("2026-08-09", "quarterly")).toBe("2026-11-09");
    expect(advanceNextRun("2026-08-09", "yearly")).toBe("2027-08-09");
  });

  it("mesačná faktúra na 31. nepreskočí február", () => {
    expect(advanceNextRun("2026-01-31", "monthly")).toBe("2026-02-28");
  });

  it("berie aj Date, nielen reťazec", () => {
    expect(advanceNextRun(new Date("2026-08-09T00:00:00Z"), "monthly")).toBe("2026-09-09");
  });
});
