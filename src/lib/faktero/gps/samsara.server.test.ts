/**
 * Testy adaptéra Samsara s podvrhnutými odpoveďami podľa dokumentácie:
 *  - https://developers.samsara.com/docs/rest-api-overview (Bearer, pagination endCursor/hasNextPage)
 *  - https://developers.samsara.com/reference/listvehicles (GET /fleet/vehicles)
 *  - https://developers.samsara.com/reference/getvehiclestats (obdOdometerMeters)
 *  - https://developers.samsara.com/reference/gettrips (GET /trips/stream, TripResponseBody)
 *  - legacy GET /v1/fleet/trips (V1TripResponse: startMs, endMs, distanceMeters, startOdometer…)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { adapter, adresaZoSamsary } from "./samsara.server";
import { GpsChyba } from "./typy";

const P = { token: "samsara_api_TAJNY" };

const VOZIDLA = {
  data: [
    { id: "112", name: "Octavia", licensePlate: "BA123XY", vin: "TMBJJ7NE0J0123456" },
    { id: "113", name: "Dodávka", licensePlate: "", vin: "" },
  ],
  pagination: { endCursor: "", hasNextPage: false },
};

const STATS = {
  data: [
    {
      id: "112",
      name: "Octavia",
      obdOdometerMeters: { time: "2026-10-30T10:00:00Z", value: 123456789 },
    },
  ],
  pagination: { endCursor: "", hasNextPage: false },
};

const STREAM_1 = {
  data: [
    {
      asset: { id: "112" },
      completionStatus: "completed",
      createdAtTime: "2026-10-01T07:00:05Z",
      updatedAtTime: "2026-10-01T07:31:00Z",
      tripStartTime: "2026-10-01T07:00:00Z",
      tripEndTime: "2026-10-01T07:30:00Z",
      startLocation: {
        latitude: 48.1486,
        longitude: 17.1077,
        headingDegrees: 90,
        address: {
          street: "Hlavná",
          streetNumber: "1",
          city: "Bratislava",
          postalCode: "81101",
          country: "SK",
        },
      },
      endLocation: { latitude: 48.3774, longitude: 17.5872, headingDegrees: 10 },
      finalDistanceMeters: 50250,
    },
  ],
  pagination: { endCursor: "c2", hasNextPage: true },
};
const STREAM_2 = {
  data: [
    {
      asset: { id: "112" },
      completionStatus: "inProgress",
      createdAtTime: "2026-10-01T16:00:05Z",
      updatedAtTime: "2026-10-01T16:10:00Z",
      tripStartTime: "2026-10-01T16:00:00Z",
      startLocation: { latitude: 48.3774, longitude: 17.5872, headingDegrees: 0 },
    },
  ],
  pagination: { endCursor: "", hasNextPage: false },
};

const V1_TRIPS = {
  trips: [
    {
      startMs: 1759302000000,
      endMs: 1759303800000,
      startLocation: "Hlavná 1, Bratislava",
      endLocation: "Trnava",
      startCoordinates: { latitude: 48.1486, longitude: 17.1077 },
      endCoordinates: { latitude: 48.3774, longitude: 17.5872 },
      distanceMeters: 50250,
      fuelConsumedMl: 3200,
      driverId: 719,
      codriverIds: [],
      startOdometer: 123406539,
      endOdometer: 123456789,
      tollMeters: 0,
      assetIds: [],
    },
    {
      startMs: 1759330000000,
      endMs: 9223372036854775807,
      distanceMeters: 1000,
      driverId: 719,
      startOdometer: 0,
      endOdometer: 0,
    },
  ],
};

const DRIVERS = {
  data: [{ id: "719", name: "Ján Novák" }],
  pagination: { endCursor: "", hasNextPage: false },
};

let volania: { url: URL; auth: string | null }[] = [];

function nastavFetch(spracuj: (u: URL) => { status?: number; body?: unknown }) {
  volania = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const u = new URL(url);
      volania.push({ url: u, auth: new Headers(init.headers).get("Authorization") });
      const r = spracuj(u);
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("adresaZoSamsary", () => {
  it("poskladá adresu", () => {
    expect(
      adresaZoSamsary({
        street: "Hlavná",
        streetNumber: "1",
        postalCode: "81101",
        city: "Bratislava",
      }),
    ).toBe("Hlavná 1, 81101 Bratislava");
    expect(adresaZoSamsary({})).toBeNull();
  });
});

describe("Samsara adaptér", () => {
  it("vozidlá s Bearer tokenom a tachometrom z obdOdometerMeters", async () => {
    nastavFetch((u) => ({ body: u.pathname === "/fleet/vehicles/stats" ? STATS : VOZIDLA }));
    const v = await adapter.vozidla(P);
    expect(volania[0].auth).toBe("Bearer samsara_api_TAJNY");
    expect(volania[0].url.pathname).toBe("/fleet/vehicles");
    expect(volania[1].url.searchParams.get("types")).toBe("obdOdometerMeters,gpsOdometerMeters");
    expect(v).toEqual([
      {
        externeId: "112",
        spz: "BA123XY",
        nazov: "Octavia",
        vin: "TMBJJ7NE0J0123456",
        tachometerKm: 123457,
      },
      { externeId: "113", spz: null, nazov: "Dodávka", vin: null, tachometerKm: null },
    ]);
  });

  it("vozidlá ostanú, aj keď token nemá právo na štatistiky", async () => {
    nastavFetch((u) =>
      u.pathname === "/fleet/vehicles/stats"
        ? { status: 403, body: { message: "Forbidden" } }
        : { body: VOZIDLA },
    );
    const v = await adapter.vozidla(P);
    expect(v).toHaveLength(2);
    expect(v[0].tachometerKm).toBeNull();
  });

  it("401 → prihlasenie, token nie je v hláške", async () => {
    nastavFetch(() => ({ status: 401, body: { message: "Unauthorized", requestId: "x" } }));
    const e = await adapter.test(P).catch((x) => x);
    expect(e).toBeInstanceOf(GpsChyba);
    expect(e.druh).toBe("prihlasenie");
    expect(e.message).not.toContain("TAJNY");
  });

  it("429 → limit", async () => {
    nastavFetch(() => ({ status: 429, body: { message: "Too Many Requests" } }));
    await expect(adapter.test(P)).rejects.toMatchObject({ druh: "limit" });
  });

  it("jazdy z /trips/stream so stránkovaním, len dokončené", async () => {
    nastavFetch((u) => ({ body: u.searchParams.get("after") === "c2" ? STREAM_2 : STREAM_1 }));
    const j = await adapter.jazdy(
      P,
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-10-02T00:00:00Z"),
      ["112"],
    );
    const q = volania[0].url.searchParams;
    expect(volania[0].url.pathname).toBe("/trips/stream");
    expect(q.get("ids")).toBe("112");
    expect(q.get("startTime")).toBe("2026-10-01T00:00:00.000Z");
    expect(q.get("queryBy")).toBe("tripStartTime");
    expect(volania[1].url.searchParams.get("after")).toBe("c2");
    expect(j).toHaveLength(1);
    expect(j[0]).toMatchObject({
      externeId: `112-${Date.parse("2026-10-01T07:00:00Z")}`,
      vozidloExterneId: "112",
      zaciatok: "2026-10-01T07:00:00.000Z",
      koniec: "2026-10-01T07:30:00.000Z",
      odAdresa: "Hlavná 1, 81101 Bratislava, SK",
      doAdresa: null,
      doLat: 48.3774,
      km: 50.25,
      vodic: null,
      sukromna: null,
    });
  });

  it("bez zapnutého /trips/stream (403) prejde na /v1/fleet/trips s vodičom a tachometrom", async () => {
    nastavFetch((u) => {
      if (u.pathname === "/trips/stream") return { status: 403, body: { message: "Forbidden" } };
      if (u.pathname === "/v1/fleet/trips") return { body: V1_TRIPS };
      if (u.pathname === "/fleet/drivers") return { body: DRIVERS };
      return { body: VOZIDLA };
    });
    const j = await adapter.jazdy(
      P,
      new Date("2025-10-01T00:00:00Z"),
      new Date("2025-10-02T00:00:00Z"),
      ["112"],
    );
    const v1 = volania.find((x) => x.url.pathname === "/v1/fleet/trips")!;
    expect(v1.url.searchParams.get("vehicleId")).toBe("112");
    expect(v1.url.searchParams.get("startMs")).toBe(String(Date.parse("2025-10-01T00:00:00Z")));
    expect(j).toHaveLength(1); // prebiehajúca jazda (endMs = Long.MAX) vynechaná
    expect(j[0]).toMatchObject({
      externeId: "112-1759302000000",
      odAdresa: "Hlavná 1, Bratislava",
      km: 50.25,
      tachometerZaciatok: 123406.5,
      tachometerKoniec: 123456.8,
      vodic: "Ján Novák",
      spotrebaL: 3.2,
      sukromna: null,
    });
  });

  it("bez zoznamu vozidiel si ich najprv načíta", async () => {
    nastavFetch((u) => ({
      body:
        u.pathname === "/trips/stream" ? { data: [], pagination: { hasNextPage: false } } : VOZIDLA,
    }));
    await adapter.jazdy(P, new Date("2026-10-01"), new Date("2026-10-02"));
    expect(volania[1].url.searchParams.get("ids")).toBe("112,113");
  });

  it("prázdny token → prihlasenie bez volania", async () => {
    nastavFetch(() => ({}));
    await expect(adapter.test({ token: " " })).rejects.toMatchObject({ druh: "prihlasenie" });
    expect(volania).toHaveLength(0);
  });
});
