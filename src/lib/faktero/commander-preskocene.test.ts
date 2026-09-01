import { describe, expect, it } from "vitest";
import {
  emptySkipBreakdown,
  zalogovatPreskocenu,
  jeDuplicitaVDatabaze,
  jazdaBezKilometrov,
  type CommanderSkipReason,
} from "./commander-preskocene";

/** Preskočí jazdu tak, ako to robí synchronizácia: zvýš počítadlo, potom sa pýtaj. */
function preskoc(
  breakdown: Record<CommanderSkipReason, number>,
  reason: CommanderSkipReason,
): boolean {
  breakdown[reason]++;
  return zalogovatPreskocenu(reason, breakdown);
}

describe("logovanie preskočených jázd", () => {
  it("duplicity nelogujú nikdy — pri dennom behu je to bežný stav", () => {
    const b = emptySkipBreakdown();
    const vypisane = Array.from({ length: 500 }, () => preskoc(b, "duplicate_external_id")).filter(
      Boolean,
    );
    expect(vypisane).toHaveLength(0);
    // Počítadlo ale musí sedieť, na to sa pozerá prehľad synchronizácie.
    expect(b.duplicate_external_id).toBe(500);
  });

  it("skutočnú chybu vypíše, ale len prvé tri výskyty", () => {
    const b = emptySkipBreakdown();
    const vypisane = Array.from({ length: 10 }, () => preskoc(b, "insert_error")).filter(Boolean);
    expect(vypisane).toHaveLength(3);
    expect(b.insert_error).toBe(10);
  });

  it("každý dôvod má vlastný strop", () => {
    const b = emptySkipBreakdown();
    for (let i = 0; i < 5; i++) preskoc(b, "insert_error");
    expect(preskoc(b, "validation_error")).toBe(true);
    expect(preskoc(b, "vehicle_not_linked")).toBe(true);
  });

  it("hlášku o porušení unikátneho indexu rozpozná ako duplicitu", () => {
    expect(
      jeDuplicitaVDatabaze(
        'duplicate key value violates unique constraint "idx_trips_external_unique"',
      ),
    ).toBe(true);
    expect(
      jeDuplicitaVDatabaze("null value in column start_time violates not-null constraint"),
    ).toBe(false);
    expect(jeDuplicitaVDatabaze(null)).toBe(false);
  });
});

describe("jazdaBezKilometrov", () => {
  it("nulová jazda z Commanderu do knihy nepatrí", () => {
    expect(jazdaBezKilometrov(0)).toBe(true);
  });

  it("jazda s kilometrami prejde, aj keď je krátka", () => {
    expect(jazdaBezKilometrov(0.3)).toBe(false);
    expect(jazdaBezKilometrov(120)).toBe(false);
  });

  // Zápornú vzdialenosť odmietne kontrola pred týmto; keby sa sem predsa
  // dostala, nech skončí rovnako — v knihe nemá čo hľadať.
  it("záporná vzdialenosť tiež neprejde", () => {
    expect(jazdaBezKilometrov(-5)).toBe(true);
  });

  it("neznáme číslo neposudzuje", () => {
    expect(jazdaBezKilometrov(Number.NaN)).toBe(false);
  });
});
