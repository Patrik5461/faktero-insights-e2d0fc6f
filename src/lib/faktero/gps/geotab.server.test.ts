/**
 * Testy adaptéra Geotab s podvrhnutými odpoveďami podľa dokumentácie MyGeotab API:
 *  - https://developers.geotab.com/myGeotab/guides/concepts/ (JSON-RPC, credentials, path)
 *  - https://developers.geotab.com/myGeotab/apiReference/methods/Authenticate
 *  - https://developers.geotab.com/myGeotab/apiReference/objects/Trip
 *  - https://developers.geotab.com/myGeotab/apiReference/objects/GoDevice
 *  - https://developers.geotab.com/myGeotab/apiReference/objects/FuelTransaction
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adapter, hostServera } from "./geotab.server";
import { GpsChyba } from "./typy";

const P = { server: "", database: "firma_db", user: "jano@firma.sk", password: "tajne-heslo" };

const AUTH_OK = {
  jsonrpc: "2.0",
  result: {
    credentials: { database: "firma_db", sessionId: "abc123session", userName: "jano@firma.sk" },
    path: "my456.geotab.com",
  },
};

const DEVICES = [
  {
    id: "b1",
    name: "Octavia",
    serialNumber: "G9A1B2C3D4E5",
    licensePlate: "BA123XY",
    vehicleIdentificationNumber: "TMBJJ7NE0J0123456",
    activeFrom: "2024-01-01T00:00:00.000Z",
    activeTo: "2050-01-01T00:00:00.000Z",
  },
  {
    id: "b2",
    name: "Dodávka",
    serialNumber: "G9F1F2F3F4F5",
    licensePlate: "",
    vehicleIdentificationNumber: "",
  },
];

const TRIPS = [
  {
    id: "t2",
    device: { id: "b1" },
    driver: { id: "u7" },
    start: "2026-10-01T10:00:00.000Z",
    stop: "2026-10-01T10:40:00.000Z",
    nextTripStart: "2026-10-01T15:00:00.000Z",
    distance: 32.5,
    odometer: 123456789,
    stopPoint: { x: 17.1077, y: 48.1486 },
  },
  {
    id: "t1",
    device: { id: "b1" },
    driver: "UnknownDriverId",
    start: "2026-10-01T07:00:00.000Z",
    stop: "2026-10-01T07:30:00.000Z",
    nextTripStart: "2026-10-01T10:00:00.000Z",
    distance: 20,
    odometer: 0,
    stopPoint: { x: 17.5872, y: 48.3774 },
  },
];

const USERS = [{ id: "u7", name: "jano@firma.sk", firstName: "Ján", lastName: "Novák" }];

const FUEL = [
  {
    id: "f1",
    dateTime: "2026-10-02T08:15:00.000Z",
    device: { id: "b1" },
    licencePlate: "BA123XY",
    volume: 45.3,
    cost: 72.48,
    currencyCode: "EUR",
    odometer: 123500,
    productType: "Diesel",
    siteName: "Slovnaft Trnava",
    location: { x: 17.58, y: 48.37 },
  },
  { id: "f2", dateTime: "2026-10-03T08:15:00.000Z", device: "NoDeviceId", volume: 0 },
];

let volania: { url: string; body: any }[] = [];

function nastavFetch(odpovede: Record<string, unknown>) {
  volania = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      volania.push({ url, body });
      const kluc = body.method === "Get" ? `Get:${body.params.typeName}` : body.method;
      const odp = odpovede[kluc];
      return new Response(JSON.stringify(odp ?? { jsonrpc: "2.0", result: [] }), { status: 200 });
    }),
  );
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("hostServera", () => {
  it("normalizuje zadaný server", () => {
    expect(hostServera("")).toBe("my.geotab.com");
    expect(hostServera("https://my123.geotab.com/")).toBe("my123.geotab.com");
    expect(hostServera("my123.geotab.com/apiv1")).toBe("my123.geotab.com");
  });
});

describe("Geotab adaptér", () => {
  it("prihlási sa a ďalšie volania posiela na server z path s credentials", async () => {
    nastavFetch({ Authenticate: AUTH_OK, "Get:Device": { jsonrpc: "2.0", result: DEVICES } });
    const v = await adapter.vozidla(P);
    expect(volania[0].url).toBe("https://my.geotab.com/apiv1");
    expect(volania[0].body).toEqual({
      method: "Authenticate",
      params: { database: "firma_db", userName: "jano@firma.sk", password: "tajne-heslo" },
    });
    expect(volania[1].url).toBe("https://my456.geotab.com/apiv1");
    expect(volania[1].body.params.credentials.sessionId).toBe("abc123session");
    expect(volania[1].body.params.credentials).not.toHaveProperty("password");
    expect(v).toEqual([
      { externeId: "b1", spz: "BA123XY", nazov: "Octavia", vin: "TMBJJ7NE0J0123456" },
      { externeId: "b2", spz: null, nazov: "Dodávka", vin: null },
    ]);
  });

  it("zlé heslo → GpsChyba prihlasenie bez hesla v hláške", async () => {
    nastavFetch({
      Authenticate: {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Incorrect login credentials @ 'firma_db'",
          data: { id: "x", type: "InvalidUserException", requestIndex: 0 },
          errors: [{ message: "Incorrect login credentials", name: "InvalidUserException" }],
        },
      },
    });
    const e = await adapter.test(P).catch((x) => x);
    expect(e).toBeInstanceOf(GpsChyba);
    expect(e.druh).toBe("prihlasenie");
    expect(e.message).not.toContain("tajne-heslo");
  });

  it("OverLimitException → limit", async () => {
    nastavFetch({
      Authenticate: {
        jsonrpc: "2.0",
        error: { message: "API calls quota exceeded", data: { type: "OverLimitException" } },
      },
    });
    await expect(adapter.test(P)).rejects.toMatchObject({ druh: "limit" });
  });

  it("jazdy: km, tachometer z metrov, začiatok zo stopPoint predošlej jazdy, vodič", async () => {
    nastavFetch({
      Authenticate: AUTH_OK,
      "Get:Trip": { jsonrpc: "2.0", result: TRIPS },
      "Get:User": { jsonrpc: "2.0", result: USERS },
    });
    const j = await adapter.jazdy(P, new Date("2026-10-01"), new Date("2026-10-02"), ["b1"]);
    const trip = volania.find((x) => x.body.params.typeName === "Trip")!;
    expect(trip.body.params.search).toEqual({
      fromDate: "2026-10-01T00:00:00.000Z",
      toDate: "2026-10-02T00:00:00.000Z",
      deviceSearch: { id: "b1" },
    });
    expect(j.map((x) => x.externeId)).toEqual(["t1", "t2"]);
    expect(j[0]).toMatchObject({
      km: 20,
      vodic: null,
      odLat: null,
      doLat: 48.3774,
      doLng: 17.5872,
      tachometerKoniec: null,
      sukromna: null,
    });
    expect(j[1]).toMatchObject({
      vozidloExterneId: "b1",
      zaciatok: "2026-10-01T10:00:00.000Z",
      koniec: "2026-10-01T10:40:00.000Z",
      km: 32.5,
      odLat: 48.3774,
      odLng: 17.5872,
      doLat: 48.1486,
      tachometerKoniec: 123456.8,
      tachometerZaciatok: 123424.3,
      vodic: "Ján Novák",
    });
  });

  it("tankovania: litre, suma, mena; nulový objem sa vynechá", async () => {
    nastavFetch({ Authenticate: AUTH_OK, "Get:FuelTransaction": { jsonrpc: "2.0", result: FUEL } });
    const t = await adapter.tankovania!(P, new Date("2026-10-01"), new Date("2026-10-31"));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({
      externeId: "f1",
      vozidloExterneId: "b1",
      spz: "BA123XY",
      cas: "2026-10-02T08:15:00.000Z",
      litre: 45.3,
      suma: 72.48,
      mena: "EUR",
      palivo: "Diesel",
      miesto: "Slovnaft Trnava",
      tachometerKm: 123500,
    });
  });

  it("chýbajúce údaje → prihlasenie bez volania", async () => {
    nastavFetch({});
    await expect(adapter.test({ database: "x", user: "", password: "" })).rejects.toMatchObject({
      druh: "prihlasenie",
    });
    expect(volania).toHaveLength(0);
  });

  it("výpadok siete → siet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("fetch failed"))),
    );
    await expect(adapter.test(P)).rejects.toMatchObject({ druh: "siet" });
  });
});

describe("server (bezpečnosť)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("povolí len *.geotab.com", async () => {
    const { jeServerGeotabu } = await import("./geotab.server");
    expect(jeServerGeotabu("my.geotab.com")).toBe(true);
    expect(jeServerGeotabu("my123.geotab.com")).toBe(true);
    expect(jeServerGeotabu("geotab.com.evil.sk")).toBe(false);
    expect(jeServerGeotabu("10.0.0.1")).toBe(false);
    expect(jeServerGeotabu("evil.sk/x.geotab.com")).toBe(false);
    expect(jeServerGeotabu("my.geotab.com:8080")).toBe(false);
  });
  it("zadaný cudzí server heslo nedostane", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const e = await adapter.test({ ...P, server: "https://127.0.0.1" }).catch((x) => x);
    expect(e.druh).toBe("prihlasenie");
    expect(f).not.toHaveBeenCalled();
  });
  it("path z odpovede mimo geotab.com sa nepoužije", async () => {
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            result: {
              credentials: { database: "d", userName: "u", sessionId: "s" },
              path: "10.0.0.1",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", f);
    const e = await adapter.test(P).catch((x) => x);
    expect(e).toBeInstanceOf(GpsChyba);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
