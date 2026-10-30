/**
 * GPS Dozor — testy s podvrhnutými odpoveďami.
 * Vzorky podľa https://www.gpsdozor.cz/documentation/api a odpovedí DEMO účtu z 30. 10. 2026
 * (DEMO sa v teste nevolá).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adapter,
  formatCasu,
  mapujJazdu,
  menoVodica,
  naIso,
  oknaObdobia,
  ZAKLAD,
} from "./gpsdozor.server";
import { GpsChyba } from "./typy";

const P = { login: "api_test", heslo: "tajne" };

const SKUPINY = [{ Code: "SAGU", Name: "GPS Dozor DEMO" }];
const VOZIDLA = [
  {
    Code: "ZODIDOZEBU",
    GroupCode: "SAGU",
    BranchId: null,
    BranchName: "",
    Name: "MAN",
    SPZ: "2A6 3358",
    BatteryPercentage: 0,
    Speed: 85.0,
    LastPosition: { Latitude: "57.152575", Longitude: "-3.902355" },
    LastPositionTimestamp: "2026-10-30T22:14:50Z",
    Odometer: 541358,
    RefuelingCards: [],
  },
  { Code: "OBEHEHUGOV", GroupCode: "SAGU", Name: "Package", SPZ: "", Odometer: 0 },
];
const JAZDY = [
  {
    AverageSpeed: 68.0,
    MaxSpeed: 99.0,
    TripType: false,
    Id: 11297252,
    StartTime: "2026-10-28T05:57:04",
    FinishTime: "2026-10-28T06:35:12",
    StartPosition: { Latitude: "52.594529", Longitude: "1.292241" },
    FinishPosition: { Latitude: "52.43224", Longitude: "0.77915" },
    StartAddress: "Norwich Southern Bypass, South Norfolk, Caistor St Edmund, GB",
    FinishAddress: "Thetford Bypass, Breckland, GB",
    TripLength: "00:38",
    TripWaitingTime: "00:00",
    TotalDistance: 43.286,
    DriverName: "Slaný, Jaroslav",
    DriverChipCode: "000000753559",
    IsFinished: true,
    Odometer: 539602,
    FuelConsumed: { Value: 3.5, VolumeUnit: 0 },
    TripCost: { Value: 1350.5232, Currency: 0 },
  },
  {
    TripType: true,
    StartTime: "2017-07-20T03:51:17",
    FinishTime: "2017-07-20T05:18:25",
    StartPosition: { Latitude: "49.490175", Longitude: "7.954" },
    FinishPosition: { Latitude: "49.13425", Longitude: "6.546075" },
    StartAddress: "",
    FinishAddress: "",
    TotalDistance: 118.021,
    Purpose: "Pick-up delivery",
    FuelConsumed: { Value: 1, VolumeUnit: 1 },
  },
  { Id: 3, StartTime: "2026-10-30T21:32:12", FinishTime: "2026-10-30T22:14:50", IsFinished: false },
];

function odpoved(telo: unknown, status = 200) {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("GPS Dozor — pomocné funkcie", () => {
  it("časy bez zóny berie ako UTC", () => {
    expect(naIso("2026-10-28T05:57:04")).toBe("2026-10-28T05:57:04.000Z");
    expect(naIso("2026-10-28T05:57:04+02:00")).toBe("2026-10-28T03:57:04.000Z");
    expect(naIso("")).toBeNull();
  });
  it("formát parametrov from/to", () => {
    expect(formatCasu(new Date("2018-05-20T00:00:00Z"))).toBe("2018-05-20T00:00");
  });
  it("delí obdobie na okná do 30 dní", () => {
    const okna = oknaObdobia(new Date("2026-07-01T00:00:00Z"), new Date("2026-10-01T00:00:00Z"));
    expect(okna.length).toBe(4);
    for (const [z, k] of okna) expect(k.getTime() - z.getTime()).toBeLessThanOrEqual(29 * 86400000);
    expect(okna[0][0].toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(okna.at(-1)![1].toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
  it("meno vodiča", () => {
    expect(menoVodica("Doe, John")).toBe("John Doe");
    expect(menoVodica("Ján Novák")).toBe("Ján Novák");
    expect(menoVodica("")).toBeNull();
  });
  it("mapuje jazdu z dokumentácie", () => {
    const j = mapujJazdu("ZODIDOZEBU", JAZDY[0])!;
    expect(j).toMatchObject({
      externeId: "11297252",
      vozidloExterneId: "ZODIDOZEBU",
      zaciatok: "2026-10-28T05:57:04.000Z",
      koniec: "2026-10-28T06:35:12.000Z",
      odAdresa: "Norwich Southern Bypass, South Norfolk, Caistor St Edmund, GB",
      odLat: 52.594529,
      doLng: 0.77915,
      km: 43.286,
      tachometerKoniec: 539602,
      tachometerZaciatok: 539559,
      vodic: "Jaroslav Slaný",
      sukromna: false,
      ucel: null,
      spotrebaL: 3.5,
    });
    const j2 = mapujJazdu("X", JAZDY[1])!;
    expect(j2.externeId).toBe("X:2017-07-20T03:51:17");
    expect(j2.sukromna).toBe(true);
    expect(j2.ucel).toBe("Pick-up delivery");
    expect(j2.odAdresa).toBeNull();
    expect(j2.tachometerZaciatok).toBeNull();
    expect(j2.spotrebaL).toBe(3.79); // US galón
    expect(mapujJazdu("X", JAZDY[2])).toBeNull(); // nedokončená
  });
});

describe("GPS Dozor — adaptér", () => {
  it("posiela Basic auth a číta vozidlá zo skupín", async () => {
    const volania: Array<{ url: string; auth: string | null }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        volania.push({ url, auth: (init.headers as Record<string, string>).Authorization });
        if (url.endsWith("/groups")) return odpoved(SKUPINY);
        if (url.endsWith("/vehicles/group/SAGU")) return odpoved(VOZIDLA);
        return odpoved({}, 404);
      }),
    );
    const v = await adapter.vozidla(P);
    expect(v).toEqual([
      { externeId: "ZODIDOZEBU", spz: "2A6 3358", nazov: "MAN", tachometerKm: 541358 },
      { externeId: "OBEHEHUGOV", spz: null, nazov: "Package", tachometerKm: 0 },
    ]);
    expect(volania[0].url).toBe(ZAKLAD + "groups");
    expect(volania[0].auth).toBe("Basic " + Buffer.from("api_test:tajne").toString("base64"));
  });

  it("jazdy po oknách, bez duplicít na hranici", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return odpoved([JAZDY[0]]);
      }),
    );
    const j = await adapter.jazdy(
      P,
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-10-30T00:00:00Z"),
      ["ZODIDOZEBU"],
    );
    expect(urls.length).toBe(3);
    expect(urls[0]).toBe(
      ZAKLAD + "vehicle/ZODIDOZEBU/trips?from=2026-09-01T00:00&to=2026-09-30T00:00",
    );
    expect(j.length).toBe(1);
  });

  it("401 je chyba prihlásenia bez hesla v správe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => odpoved({ Message: "Authorization denied" }, 401)),
    );
    const e = await adapter.test(P).catch((x) => x);
    expect(e).toBeInstanceOf(GpsChyba);
    expect(e.druh).toBe("prihlasenie");
    expect(String(e.message)).not.toContain("tajne");
  });

  it("400 Timespan error prepíše do správy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => odpoved({ Message: "10/30/2026 11:07:51 PM - Timespan error." }, 400)),
    );
    const e = await adapter.test(P).catch((x) => x);
    expect(e.druh).toBe("api");
    expect(e.message).toContain("Timespan error.");
  });

  it("výpadok siete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const e = await adapter.test(P).catch((x) => x);
    expect(e.druh).toBe("siet");
  });

  it("bez hesla nevolá API", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const e = await adapter.test({ login: "x", heslo: "" }).catch((x) => x);
    expect(e.druh).toBe("prihlasenie");
    expect(f).not.toHaveBeenCalled();
  });

  it("tankovania ani zápis účelu jazdy nevie", () => {
    expect(adapter.tankovania).toBeUndefined();
    expect(adapter.oznacSukromnu).toBeUndefined();
  });
});
