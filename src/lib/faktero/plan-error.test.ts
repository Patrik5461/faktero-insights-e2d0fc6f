import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Hláška o neaktívnom predplatnom.
 *
 * Na webe posiela človeka „do sekcie Predplatné“. V appke z App Store je to
 * výzva na nákup mimo appky a dôvod na zamietnutie (pravidlo 3.1.1) — tam má
 * povedať len to, že sa akcia nedá.
 */
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("hláška o bloku plánu", () => {
  it("spozná blok z databázy aj zo servera", async () => {
    const { jeBlokPlanu } = await import("./plan-error");
    expect(jeBlokPlanu("FAKTERO_PLAN_BLOCK:invoice")).toBe(true);
    expect(jeBlokPlanu("Vaše predplatné nie je aktívne. Pre pokračovanie si aktivujte plán.")).toBe(true);
    expect(jeBlokPlanu("Doklad s týmto číslom už existuje.")).toBe(false);
  });

  it("na webe ukáže, kde sa plán aktivuje", async () => {
    const { planBlockMessage } = await import("./plan-error");
    expect(planBlockMessage(new Error("FAKTERO_PLAN_BLOCK:invoice"))).toContain("Predplatné");
  });

  it("v appke z obchodu nehovorí o pláne ani o kúpe", async () => {
    vi.stubEnv("VITE_V_OBCHODE", "1");
    const { planBlockMessage, BEZ_VYZVY_NA_NAKUP } = await import("./plan-error");
    for (const druh of ["invoice", "customer", "quote", "recurring", "user"]) {
      const sprava = planBlockMessage(new Error(`FAKTERO_PLAN_BLOCK:${druh}`));
      expect(sprava).toBe(BEZ_VYZVY_NA_NAKUP);
    }
    expect(BEZ_VYZVY_NA_NAKUP).not.toMatch(/plán|predplat|aktivuj|kúp/i);
  });

  it("iné chyby nechá tak", async () => {
    vi.stubEnv("VITE_V_OBCHODE", "1");
    const { planBlockMessage } = await import("./plan-error");
    expect(planBlockMessage(new Error("Nie je vyplnené povinné pole."))).toBeNull();
  });
});
