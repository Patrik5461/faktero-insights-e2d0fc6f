import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { finstatLookup } from "./finstat.server";

const ICO = "12345678";
const PUB = "pubkey";
const PRIV = "privkey";
const expectedHash = createHash("sha256").update(`SomeSalt+${PUB}+${PRIV}++${ICO}+ended`).digest("hex");

function mockFetch(impl: (url: string) => { status: number; body: string; headers?: Record<string, string> }) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    const url = typeof input === "string" ? input : input.url;
    const r = impl(url);
    return new Response(r.body, {
      status: r.status,
      headers: { "content-type": "application/json", ...(r.headers ?? {}) },
    });
  });
}

describe("finstatLookup", () => {
  beforeEach(() => {
    process.env.FINSTAT_PUBLIC_KEY = PUB;
    process.env.FINSTAT_PRIVATE_KEY = PRIV;
    delete process.env.FINSTAT_STATION_ID;
    delete process.env.FINSTAT_STATION_NAME;
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns ok with mapped fields and sends ico/apikey/hash only", async () => {
    let capturedUrl = "";
    mockFetch((url) => {
      capturedUrl = url;
      return {
        status: 200,
        body: JSON.stringify({
          Ico: ICO,
          Name: "ACME s.r.o.",
          Dic: "2020123456",
          IcDph: "SK2020123456",
          Street: "Hlavná",
          StreetNumber: "1",
          City: "Bratislava",
          Zip: "81101",
          Country: "SK",
        }),
      };
    });

    const res = await finstatLookup(ICO);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.data).toMatchObject({
      ico: ICO,
      name: "ACME s.r.o.",
      dic: "2020123456",
      ic_dph: "SK2020123456",
      street: "Hlavná 1",
      city: "Bratislava",
      zip: "811 01",
      country: "SK",
    });

    const u = new URL(capturedUrl);
    expect(u.searchParams.get("ico")).toBe(ICO);
    expect(u.searchParams.get("apiKey")).toBe(PUB);
    expect(u.searchParams.get("Hash")).toBe(expectedHash);
    expect(u.searchParams.get("StationId")).toBeNull();
    expect(u.searchParams.get("StationName")).toBeNull();
  });

  it("returns auth error on 403", async () => {
    mockFetch(() => ({ status: 403, body: "Forbidden" }));
    const res = await finstatLookup(ICO);
    expect(res.status).toBe("error");
    if (res.status === "error")
      expect(res.message).toBe("Autorizácia FinStat API zlyhala. Skontrolujte API kľúče alebo spôsob generovania hash.");
  });

  it("returns not_found on 404", async () => {
    mockFetch(() => ({ status: 404, body: "" }));
    const res = await finstatLookup(ICO);
    expect(res.status).toBe("not_found");
  });

  it("returns not_configured when keys are missing", async () => {
    delete process.env.FINSTAT_PUBLIC_KEY;
    const res = await finstatLookup(ICO);
    expect(res.status).toBe("error");
    if (res.status === "error") expect(res.message).toBe("FinStat API nie je nakonfigurované.");
  });
});