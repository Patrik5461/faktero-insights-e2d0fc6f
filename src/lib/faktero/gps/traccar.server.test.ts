/**
 * Traccar adaptér proti podvrhnutým odpovediam.
 *
 * Tvar odpovedí podľa OpenAPI https://www.traccar.org/api-reference/openapi.yaml
 * (schémy `Device` a `ReportTrips`; `startPositionId`/`startOdometer` posiela server
 * navyše, v OpenAPI nie sú). Dokumentácia: https://www.traccar.org/traccar-api/
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ ...dns, default: dns }));

import { adapter, naJazdu, naVozidlo, overAdresuServera, vyzeraAkoSpz } from "./traccar.server";

/** `GET /api/devices` — pole `Device`. */
const ZARIADENIA = [
  {
    id: 7,
    name: "BA-123AB",
    uniqueId: "359633100001234",
    status: "online",
    disabled: false,
    lastUpdate: "2026-10-30T08:00:00.000+00:00",
    positionId: 991,
    groupId: null,
    phone: "",
    model: "FMB920",
    contact: "",
    category: "car",
    attributes: {},
  },
  {
    id: 8,
    name: "Dodávka",
    uniqueId: "359633100005678",
    disabled: false,
    attributes: { licensePlate: "TT 456 CD", vin: "WF0XXXTTGXKA12345" },
  },
  { id: 9, name: "Starý", uniqueId: "1", disabled: true, attributes: {} },
];

/** `GET /api/reports/trips` — pole `ReportTrips`. */
const JAZDA = {
  deviceId: 7,
  deviceName: "BA-123AB",
  business: false,
  maxSpeed: 63.7,
  averageSpeed: 24.1,
  distance: 53312.4,
  spentFuel: 3.2,
  duration: 5400000,
  startTime: "2026-10-01T06:10:00.000+00:00",
  startAddress: "Mlynské nivy 1, Bratislava",
  startLat: 48.148,
  startLon: 17.126,
  endTime: "2026-10-01T07:40:00.000+00:00",
  endAddress: "Hlavná 5, Trnava",
  endLat: 48.377,
  endLon: 17.587,
  driverUniqueId: "D7",
  driverName: "Ján Novák",
  startPositionId: 1001,
  endPositionId: 1450,
  startOdometer: 12345600,
  endOdometer: 12398912,
};

const P = { url: "https://gps.firma.sk", email: "uctovnik@firma.sk", heslo: "tajne" };

type Odpoved = { status?: number; body: unknown; headers?: Record<string, string> };
let fronta: Odpoved[] = [];
let volania: { url: URL; init: RequestInit }[] = [];

beforeEach(() => {
  fronta = [];
  volania = [];
  dns.lookup.mockReset();
  dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      volania.push({ url: new URL(url), init });
      const o = fronta.shift() ?? { body: [] };
      return new Response(typeof o.body === "string" ? o.body : JSON.stringify(o.body), {
        status: o.status ?? 200,
        headers: { "content-type": "application/json", ...(o.headers ?? {}) },
      });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("adresa servera (ochrana pred SSRF)", () => {
  it("doplní /api a zachová podcestu", async () => {
    expect(await overAdresuServera("https://gps.firma.sk")).toBe("https://gps.firma.sk/api");
    expect(await overAdresuServera("https://gps.firma.sk/")).toBe("https://gps.firma.sk/api");
    expect(await overAdresuServera("https://x.sk/traccar/api/")).toBe("https://x.sk/traccar/api");
    expect(await overAdresuServera("https://gps.firma.sk:8443")).toBe(
      "https://gps.firma.sk:8443/api",
    );
  });

  it("odmietne http, meno v adrese a nezmysel", async () => {
    await expect(overAdresuServera("http://gps.firma.sk")).rejects.toMatchObject({
      druh: "prihlasenie",
    });
    await expect(overAdresuServera("https://a:b@gps.firma.sk")).rejects.toMatchObject({
      druh: "prihlasenie",
    });
    await expect(overAdresuServera("gps.firma.sk")).rejects.toMatchObject({ druh: "prihlasenie" });
  });

  it("odmietne vnútorné adresy", async () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "::1"]) {
      dns.lookup.mockResolvedValueOnce([{ address: ip, family: ip.includes(":") ? 6 : 4 }]);
      await expect(overAdresuServera("https://interny.firma.sk")).rejects.toMatchObject({
        druh: "prihlasenie",
      });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("presmerovanie nenasleduje", async () => {
    fronta.push({ status: 302, body: "", headers: { location: "http://10.0.0.1/api/devices" } });
    await expect(adapter.test(P)).rejects.toMatchObject({ druh: "prihlasenie" });
    expect(volania[0].init.redirect).toBe("manual");
  });
});

describe("prihlásenie", () => {
  it("Basic z e-mailu a hesla", async () => {
    fronta.push({ body: ZARIADENIA });
    await adapter.test(P);
    const h = volania[0].init.headers as Record<string, string>;
    expect(h.authorization).toBe(
      `Basic ${Buffer.from("uctovnik@firma.sk:tajne").toString("base64")}`,
    );
    expect(volania[0].url.toString()).toBe("https://gps.firma.sk/api/devices");
  });

  it("Bearer token má prednosť", async () => {
    fronta.push({ body: [] });
    await adapter.test({ url: "https://gps.firma.sk", token: "RjBGMDEy" });
    expect((volania[0].init.headers as Record<string, string>).authorization).toBe(
      "Bearer RjBGMDEy",
    );
  });

  it("bez údajov ani nevolá; 401 je zlé prihlásenie", async () => {
    await expect(adapter.test({ url: "https://gps.firma.sk" })).rejects.toMatchObject({
      druh: "prihlasenie",
    });
    expect(volania.length).toBe(0);
    fronta.push({ status: 401, body: "" });
    const e = await adapter.test(P).catch((x) => x);
    expect(e).toMatchObject({ druh: "prihlasenie" });
    expect(e.message).not.toContain("tajne");
  });

  it("HTML namiesto JSON = nie je to Traccar", async () => {
    fronta.push({ body: "<html>WordPress</html>", headers: { "content-type": "text/html" } });
    await expect(adapter.test(P)).rejects.toMatchObject({ druh: "api" });
  });
});

describe("vozidlá", () => {
  it("vynechá vypnuté, ŠPZ z atribútu alebo názvu", async () => {
    fronta.push({ body: ZARIADENIA });
    expect(await adapter.vozidla(P)).toEqual([
      { externeId: "7", spz: "BA-123AB", nazov: "BA-123AB", vin: null, tachometerKm: null },
      {
        externeId: "8",
        spz: "TT 456 CD",
        nazov: "Dodávka",
        vin: "WF0XXXTTGXKA12345",
        tachometerKm: null,
      },
    ]);
  });

  it("vyzeraAkoSpz", () => {
    expect(vyzeraAkoSpz("BA123AB")).toBe(true);
    expect(vyzeraAkoSpz("ke-987xy")).toBe(true);
    expect(vyzeraAkoSpz("1AB 2345")).toBe(true);
    expect(vyzeraAkoSpz("Dodávka 2")).toBe(false);
    expect(naVozidlo({ id: 1, name: "Octavia" }).spz).toBeNull();
  });
});

describe("jazdy", () => {
  it("prevedie ReportTrips", () => {
    expect(naJazdu(JAZDA)).toMatchObject({
      externeId: "7:1001",
      vozidloExterneId: "7",
      zaciatok: "2026-10-01T06:10:00.000Z",
      koniec: "2026-10-01T07:40:00.000Z",
      odAdresa: "Mlynské nivy 1, Bratislava",
      doAdresa: "Hlavná 5, Trnava",
      odLat: 48.148,
      odLng: 17.126,
      doLat: 48.377,
      doLng: 17.587,
      km: 53.31,
      tachometerZaciatok: 12345.6,
      tachometerKoniec: 12398.9,
      vodic: "Ján Novák",
      sukromna: null,
      spotrebaL: 3.2,
    });
  });

  it("bez startPositionId použije čas štartu", () => {
    const { startPositionId: _x, ...bez } = JAZDA;
    expect(naJazdu(bez)!.externeId).toBe("7:2026-10-01T06:10:00.000Z");
  });

  it("bez zoznamu vozidiel si najprv načíta zariadenia", async () => {
    fronta.push({ body: ZARIADENIA }, { body: [JAZDA] });
    const j = await adapter.jazdy(
      P,
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-10-30T00:00:00Z"),
    );
    expect(j.length).toBe(1);
    const u = volania[1].url;
    expect(u.pathname).toBe("/api/reports/trips");
    expect(u.searchParams.getAll("deviceId")).toEqual(["7", "8"]);
    expect(u.searchParams.get("from")).toBe("2026-10-01T00:00:00.000Z");
    expect(u.searchParams.get("to")).toBe("2026-10-30T00:00:00.000Z");
    expect((volania[1].init.headers as Record<string, string>).accept).toBe("application/json");
  });

  it("dlhé obdobie po oknách, duplicity len raz", async () => {
    fronta.push({ body: [JAZDA] }, { body: [JAZDA] });
    const j = await adapter.jazdy(P, new Date("2026-01-01Z"), new Date("2026-03-01Z"), ["7"]);
    expect(volania.length).toBe(2);
    expect(j.length).toBe(1);
  });

  it("chybu servera prepošle bez hesla", async () => {
    fronta.push({ status: 400, body: "Report period limit exceeded" });
    const e = await adapter
      .jazdy(P, new Date("2026-10-01Z"), new Date("2026-10-02Z"), ["7"])
      .catch((x) => x);
    expect(e).toMatchObject({ druh: "api" });
    expect(e.message).toContain("Report period limit exceeded");
  });
});
