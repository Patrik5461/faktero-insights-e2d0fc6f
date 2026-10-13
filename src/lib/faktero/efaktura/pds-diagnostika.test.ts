import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "crypto";
import { diagnostikaPdsPodpisu, overPdsPodpis, podpisPds } from "./webhooky.server";

const telo = '[{"dic":"2121733614","verification_token":"AB"}]';
const t = "a".repeat(64);
describe("diagnostika podpisu FS", () => {
  it("podpis podľa špecifikácie prejde a diagnostika povie spec", () => {
    const h = podpisPds(telo, t);
    expect(overPdsPodpis(telo, h, t)).toBe(true);
    expect(diagnostikaPdsPodpisu(telo, h, t, {})).toContain("zhoda: spec");
  });
  it("rozpozná HMAC a tajomstvo s medzerou na konci", () => {
    const hmac = createHmac("sha512", t).update(telo).digest("hex");
    expect(diagnostikaPdsPodpisu(telo, hmac, t, {})).toContain("zhoda: hmac_hex");
    const sMedzerou = createHash("sha512")
      .update(telo + t)
      .digest("hex");
    expect(diagnostikaPdsPodpisu(telo, sMedzerou, t + "\n", {})).toContain("tajomstvo_trim");
  });
  it("nevypíše tajomstvo ani telo", () => {
    const d = diagnostikaPdsPodpisu(telo, "x", t, { "content-type": "application/json" });
    expect(d).not.toContain(t);
    expect(d).not.toContain("2121733614");
  });
});
