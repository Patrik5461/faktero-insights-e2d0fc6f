/**
 * Testy adaptéra Wialon s podvrhnutými odpoveďami podľa dokumentácie Remote API:
 *  - https://help.wialon.com/en/api/user-guide/api-reference/token/login (eid, chyby 4/7/8/1003)
 *  - https://help.wialon.com/en/api/user-guide/api-reference/core/search_items
 *  - https://help.wialon.com/en/api/user-guide/data-format/units (nm, id, mu, cnm_km, pflds)
 *  - https://help.wialon.com/en/api/user-guide/api-reference/messages/load_interval
 *  - https://help.wialon.com/en/api/user-guide/api-reference/unit/get_trips (from/to {i,t,p{y,x}}, m)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { adapter, ajaxUrl } from "./wialon.server";
import { GpsChyba } from "./typy";

const TOKEN = "a".repeat(72);
const P = { url: "", token: TOKEN };

const LOGIN = {
  host: "185.213.0.24",
  eid: "04d2a2d6a3a5f4a3b4c3d2e1f0a9b8c7",
  gis_sid: "x",
  au: "firma",
  tm: 1761868800,
  user: { nm: "firma", cls: 1, id: 717, prp: {}, crt: 717, bact: 717, fl: 0, hm: "", uacl: -1 },
};

const SEARCH = {
  searchSpec: {
    itemsType: "avl_unit",
    propName: "sys_name",
    propValueMask: "*",
    sortType: "sys_name",
    propType: "",
    or_logic: "0",
  },
  dataFlags: 8396801,
  totalItemsCount: 2,
  indexFrom: 0,
  indexTo: 1,
  items: [
    {
      nm: "Octavia",
      cls: 2,
      id: 734455,
      mu: 0,
      uacl: -1,
      cfl: 16,
      cnm: 123457,
      cnm_km: 123457,
      cneh: 0,
      cnkb: 0,
      pflds: {
        "1": { id: 1, n: "registration_plate", v: "BA123XY", ct: 1700000000, mt: 1700000000 },
        "2": { id: 2, n: "vin", v: "TMBJJ7NE0J0123456", ct: 1700000000, mt: 1700000000 },
      },
      pfldsmax: -1,
    },
    { nm: "Dodávka", cls: 2, id: 734456, mu: 0, uacl: -1, cnm: 0, cnm_km: 0, pflds: {} },
  ],
};

const TRIPS = [
  {
    from: { i: 0, t: 1759302000, p: { y: 48.1486, x: 17.1077 } },
    to: { i: 120, t: 1759303800, p: { y: 48.3774, x: 17.5872 } },
    m: 50250,
  },
];

let volania: { url: string; svc: string; params: any; sid: string | null }[] = [];

function nastavFetch(odpovede: Record<string, unknown>) {
  volania = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const b = new URLSearchParams(String(init.body));
      const svc = b.get("svc")!;
      volania.push({ url, svc, params: JSON.parse(b.get("params")!), sid: b.get("sid") });
      return new Response(JSON.stringify(odpovede[svc] ?? {}), { status: 200 });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("ajaxUrl", () => {
  it("doplní predvolený hosting a cestu", () => {
    expect(ajaxUrl("")).toBe("https://hst-api.wialon.com/wialon/ajax.html");
    expect(ajaxUrl("http://gps.firma.sk/")).toBe("http://gps.firma.sk/wialon/ajax.html");
    expect(ajaxUrl("gps.firma.sk/wialon/ajax.html")).toBe("https://gps.firma.sk/wialon/ajax.html");
  });
});

describe("Wialon adaptér", () => {
  it("vozidlá: token/login → search_items so sid, ŠPZ a VIN z profilových polí, odhlásenie", async () => {
    nastavFetch({ "token/login": LOGIN, "core/search_items": SEARCH, "core/logout": { error: 0 } });
    const v = await adapter.vozidla(P);
    expect(volania.map((x) => x.svc)).toEqual(["token/login", "core/search_items", "core/logout"]);
    expect(volania[0].url).toBe("https://hst-api.wialon.com/wialon/ajax.html");
    expect(volania[0].params).toEqual({ token: TOKEN, fl: 1 });
    expect(volania[1].sid).toBe(LOGIN.eid);
    expect(volania[1].params.flags).toBe(8396801);
    expect(v).toEqual([
      {
        externeId: "734455",
        spz: "BA123XY",
        nazov: "Octavia",
        vin: "TMBJJ7NE0J0123456",
        tachometerKm: 123457,
      },
      { externeId: "734456", spz: null, nazov: "Dodávka", vin: null, tachometerKm: null },
    ]);
  });

  it("neplatný token (error 7) → prihlasenie bez tokenu v hláške", async () => {
    nastavFetch({ "token/login": { error: 7 } });
    const e = await adapter.test(P).catch((x) => x);
    expect(e).toBeInstanceOf(GpsChyba);
    expect(e.druh).toBe("prihlasenie");
    expect(e.message).not.toContain(TOKEN);
  });

  it("error 1003 → limit", async () => {
    nastavFetch({
      "token/login": LOGIN,
      "core/search_items": { error: 1003, reason: "LIMIT api_concurrent" },
    });
    await expect(adapter.test(P)).rejects.toMatchObject({ druh: "limit" });
    // aj pri chybe sa relácia odhlási
    expect(volania.at(-1)!.svc).toBe("core/logout");
  });

  it("jazdy: load_interval + get_trips v UNIX sekundách, metre na km, unload", async () => {
    nastavFetch({
      "token/login": LOGIN,
      "messages/load_interval": { count: 3500, messages: [] },
      "unit/get_trips": TRIPS,
      "messages/unload": {},
      "core/logout": { error: 0 },
    });
    const j = await adapter.jazdy(
      P,
      new Date("2025-10-01T00:00:00Z"),
      new Date("2025-10-02T00:00:00Z"),
      ["734455"],
    );
    expect(volania.map((x) => x.svc)).toEqual([
      "token/login",
      "messages/load_interval",
      "unit/get_trips",
      "messages/unload",
      "core/logout",
    ]);
    expect(volania[1].params).toEqual({
      itemId: 734455,
      timeFrom: 1759276800,
      timeTo: 1759363200,
      flags: 0,
      flagsMask: 0xff00,
      loadCount: 0,
    });
    expect(volania[2].params).toEqual({
      itemId: 734455,
      timeFrom: 1759276800,
      timeTo: 1759363200,
      msgsSource: "1",
    });
    expect(j).toEqual([
      {
        externeId: "734455-1759302000",
        vozidloExterneId: "734455",
        zaciatok: "2025-10-01T07:00:00.000Z",
        koniec: "2025-10-01T07:30:00.000Z",
        odLat: 48.1486,
        odLng: 17.1077,
        doLat: 48.3774,
        doLng: 17.5872,
        km: 50.25,
        vodic: null,
        sukromna: null,
        surove: TRIPS[0],
      },
    ]);
  });

  it("bez zoznamu vozidiel prejde všetky jednotky", async () => {
    nastavFetch({ "token/login": LOGIN, "core/search_items": SEARCH, "unit/get_trips": [] });
    await adapter.jazdy(P, new Date("2025-10-01"), new Date("2025-10-02"));
    expect(volania.filter((x) => x.svc === "unit/get_trips").map((x) => x.params.itemId)).toEqual([
      734455, 734456,
    ]);
  });

  it("chýbajúce právo na zostavy (get_trips error 7) → prihlasenie", async () => {
    nastavFetch({ "token/login": LOGIN, "unit/get_trips": { error: 7 } });
    await expect(
      adapter.jazdy(P, new Date("2025-10-01"), new Date("2025-10-02"), ["1"]),
    ).rejects.toMatchObject({
      druh: "prihlasenie",
    });
  });

  it("prázdny token → prihlasenie bez volania", async () => {
    nastavFetch({});
    await expect(adapter.test({ token: "" })).rejects.toMatchObject({ druh: "prihlasenie" });
    expect(volania).toHaveLength(0);
  });
});
