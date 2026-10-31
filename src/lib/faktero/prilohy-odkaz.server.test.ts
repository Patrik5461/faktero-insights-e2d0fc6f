import { describe, expect, it } from "vitest";
import { overOdkazPriloh, podpisOdkazPriloh } from "./prilohy-odkaz.server";

const K = "testovaci-kluc";
const DOKLAD = "0f8e4c1a-1b2c-4d5e-8f90-123456789abc";
const P = ["aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "11111111-2222-4333-8444-555555555555"];
const TERAZ = new Date("2026-10-31T10:00:00Z");
const EXP = Math.floor(TERAZ.getTime() / 1000) + 30 * 86400;

describe("podpísaný odkaz na prílohy", () => {
  it("overí sa a vráti doklad aj prílohy", () => {
    const t = podpisOdkazPriloh({ druh: "invoice", dokladId: DOKLAD, prilohy: P, exp: EXP }, K);
    expect(overOdkazPriloh(t, TERAZ, K)).toEqual({
      druh: "invoice",
      dokladId: DOKLAD,
      prilohy: P,
      exp: EXP,
    });
  });

  it("je zakaždým iný (náhodná časť) a s 10 prílohami krátky", () => {
    const o = { druh: "quote" as const, dokladId: DOKLAD, prilohy: P, exp: EXP };
    expect(podpisOdkazPriloh(o, K)).not.toBe(podpisOdkazPriloh(o, K));
    const desat = podpisOdkazPriloh({ ...o, prilohy: Array(10).fill(P[0]) }, K);
    expect(desat.length).toBeLessThan(300);
  });

  it("po exspirácii neplatí", () => {
    const t = podpisOdkazPriloh({ druh: "invoice", dokladId: DOKLAD, prilohy: P, exp: EXP }, K);
    expect(overOdkazPriloh(t, new Date((EXP + 1) * 1000), K)).toBeNull();
  });

  it("iný kľúč alebo zmenený bajt = neplatný", () => {
    const t = podpisOdkazPriloh({ druh: "invoice", dokladId: DOKLAD, prilohy: P, exp: EXP }, K);
    expect(overOdkazPriloh(t, TERAZ, "iny-kluc")).toBeNull();
    const b = Buffer.from(t, "base64url");
    for (const i of [1, 2, 20, 35, b.length - 1]) {
      const c = Buffer.from(b);
      c[i] ^= 1;
      expect(overOdkazPriloh(c.toString("base64url"), TERAZ, K), `bajt ${i}`).toBeNull();
    }
  });

  it("odmietne odrezaný, predĺžený a nezmyselný token", () => {
    const t = podpisOdkazPriloh({ druh: "invoice", dokladId: DOKLAD, prilohy: P, exp: EXP }, K);
    expect(overOdkazPriloh(t.slice(0, -4), TERAZ, K)).toBeNull();
    expect(overOdkazPriloh(t + "AAAA", TERAZ, K)).toBeNull();
    expect(overOdkazPriloh("", TERAZ, K)).toBeNull();
    expect(overOdkazPriloh("../../etc", TERAZ, K)).toBeNull();
    expect(overOdkazPriloh("x".repeat(5000), TERAZ, K)).toBeNull();
  });

  it("neprijme zlé id ani prázdny zoznam", () => {
    expect(() =>
      podpisOdkazPriloh({ druh: "invoice", dokladId: "nie-uuid", prilohy: P, exp: EXP }, K),
    ).toThrow();
    expect(() =>
      podpisOdkazPriloh({ druh: "invoice", dokladId: DOKLAD, prilohy: [], exp: EXP }, K),
    ).toThrow();
  });
});
