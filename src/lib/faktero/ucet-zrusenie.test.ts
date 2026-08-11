import { describe, expect, it } from "vitest";
import { dniDoZrusenia, jeNaZrusenie, ODKLAD_DNI, terminZrusenia } from "./ucet-zrusenie";

const D = (s: string) => new Date(s);

describe("terminZrusenia", () => {
  it("posunie o 14 dní", () => {
    expect(terminZrusenia(D("2026-08-11T10:00:00Z")).toISOString()).toBe("2026-08-25T10:00:00.000Z");
    expect(ODKLAD_DNI).toBe(14);
  });
});

describe("dniDoZrusenia", () => {
  it("zaokrúhľuje nahor — kým ostáva hodina, je to ešte deň", () => {
    expect(dniDoZrusenia(D("2026-08-12T11:00:00Z"), D("2026-08-12T10:00:00Z"))).toBe(1);
  });

  it("celé dni sedia", () => {
    expect(dniDoZrusenia(D("2026-08-25T10:00:00Z"), D("2026-08-11T10:00:00Z"))).toBe(14);
  });

  it("po termíne je nula, nie záporné číslo", () => {
    expect(dniDoZrusenia(D("2026-08-01T10:00:00Z"), D("2026-08-11T10:00:00Z"))).toBe(0);
  });

  it("nezmyselný termín nespadne", () => {
    expect(dniDoZrusenia("neviem", D("2026-08-11T10:00:00Z"))).toBe(0);
  });
});

describe("jeNaZrusenie", () => {
  it("bez termínu nikdy", () => {
    expect(jeNaZrusenie(null)).toBe(false);
    expect(jeNaZrusenie(undefined)).toBe(false);
  });

  it("presne v termíne už áno", () => {
    expect(jeNaZrusenie("2026-08-11T10:00:00Z", D("2026-08-11T10:00:00Z"))).toBe(true);
  });

  it("pred termínom nie", () => {
    expect(jeNaZrusenie("2026-08-25T10:00:00Z", D("2026-08-11T10:00:00Z"))).toBe(false);
  });
});
