/**
 * Webfleet adaptér proti podvrhnutým odpovediam.
 *
 * Tvar odpovedí je podľa WEBFLEET.connect Reference Guide 1.57.0
 * (https://media.webfleet.com/fl_attachment/media/doc/documentations/webfleet.connect-doc-1.57.0):
 * - „Using JSON“ (s. 28–29): `outputformat=json` vráti ploché pole, prázdny výsledok `[]`,
 *   prázdne hodnoty sa vynechávajú;
 * - „Handling the response“ (s. 27–28): chyba ako text „id, popis“ + hlavičky X-Webfleet-Errorcode;
 * - showVehicleReportExtern (s. 81–83), showTripReportExtern (s. 203–208), updateLogbook (s. 211);
 * - „Response codes“ (s. 342 a ďalej): 1106 zlé prihlásenie, 1143 zlý API kľúč, 8011 limit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _nastavPreTest,
  adapter,
  jeSukromna,
  naJazdu,
  oknaObdobia,
  rozoberChybu,
  tachometreKm,
} from "./webfleet.server";
import { GpsChyba } from "./typy";

const P = { account: "demo-acc", username: "api", password: "tajne-heslo", apikey: "0123-abcd" };

/** Riadok showVehicleReportExtern podľa tabuľky „Result for showVehicleReportExtern“. */
const VOZIDLO = {
  objectno: "001",
  objectname: "Octavia BA123AB",
  licenseplatenumber: "BA123AB",
  vehicletype: "car",
  identnumber: "TMBJJ7NE0L0123456",
  objectuid: "1-23456-789ABCDEF",
};

/** Riadok showTripReportExtern podľa tabuľky „Result for showTripReportExtern“. */
const JAZDA = {
  tripid: "4711",
  tripmode: 1,
  objectno: "001",
  objectname: "Octavia BA123AB",
  start_time: "2026-10-01T06:10:00Z",
  start_odometer: 12345600,
  start_postext: "Bratislava, Mlynské nivy 1",
  end_time: "2026-10-01T07:40:00Z",
  end_odometer: 12398900,
  end_postext: "Trnava, Hlavná 5",
  duration: 5400,
  idle_time: 120,
  distance: 53300,
  avg_speed: 36,
  max_speed: 118,
  fuel_usage: 3.214,
  start_longitude: 17126000,
  start_latitude: 48148000,
  end_longitude: 17587000,
  end_latitude: 48377000,
  driverno: "D7",
  drivername: "Ján Novák",
  objectuid: "1-23456-789ABCDEF",
};

type Odpoved = { status?: number; body: string; headers?: Record<string, string> };
let fronta: Odpoved[] = [];
let volania: URL[] = [];

beforeEach(() => {
  fronta = [];
  volania = [];
  let cas = 1_000_000;
  _nastavPreTest({
    teraz: () => cas,
    cakaj: async (ms) => {
      cas += ms;
    },
    maxCakanieMs: 20_000,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      volania.push(new URL(url));
      const o = fronta.shift() ?? { body: "[]" };
      return new Response(o.body, {
        status: o.status ?? 200,
        headers: { "content-type": "application/json;charset=UTF-8", ...(o.headers ?? {}) },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("vozidlá", () => {
  it("načíta showVehicleReportExtern s ISO a JSON", async () => {
    fronta.push({ body: JSON.stringify([VOZIDLO, { objectname: "bez id" }]) });
    const v = await adapter.vozidla(P);
    expect(v).toEqual([
      {
        externeId: "1-23456-789ABCDEF",
        spz: "BA123AB",
        nazov: "Octavia BA123AB",
        vin: "TMBJJ7NE0L0123456",
        tachometerKm: null,
      },
    ]);
    const u = volania[0];
    expect(u.origin + u.pathname).toBe("https://csv.webfleet.com/extern");
    expect(u.searchParams.get("action")).toBe("showVehicleReportExtern");
    expect(u.searchParams.get("outputformat")).toBe("json");
    expect(u.searchParams.get("useISO8601")).toBe("true");
    expect(u.searchParams.get("apikey")).toBe("0123-abcd");
  });
});

describe("jazdy", () => {
  it("prevedie záznam jazdy", () => {
    const j = naJazdu(JAZDA)!;
    expect(j).toMatchObject({
      externeId: "4711",
      vozidloExterneId: "1-23456-789ABCDEF",
      zaciatok: "2026-10-01T06:10:00.000Z",
      koniec: "2026-10-01T07:40:00.000Z",
      odAdresa: "Bratislava, Mlynské nivy 1",
      doAdresa: "Trnava, Hlavná 5",
      km: 53.3,
      vodic: "Ján Novák",
      sukromna: true,
      spotrebaL: 3.214,
    });
    expect(j.odLat).toBeCloseTo(48.148);
    expect(j.odLng).toBeCloseTo(17.126);
    expect(j.doLat).toBeCloseTo(48.377);
    // rozdiel tachometrov 53 300 = distance → tachometer v metroch
    expect(j.tachometerZaciatok).toBe(12345.6);
    expect(j.tachometerKoniec).toBe(12398.9);
  });

  it("tachometer v stovkách metrov spozná podľa vzdialenosti", () => {
    expect(tachometreKm(123456, 123989, 53300)).toEqual([12345.6, 12398.9]);
    expect(tachometreKm(null, 5, 100)).toEqual([null, null]);
  });

  it("tripmode → súkromná / služobná", () => {
    expect(jeSukromna(1)).toBe(true);
    expect(jeSukromna("2")).toBe(false);
    expect(jeSukromna(3)).toBe(false); // cesta do práce
    expect(jeSukromna(0)).toBeNull();
    expect(jeSukromna(4)).toBeNull(); // oprava tachometra
    expect(jeSukromna(undefined)).toBeNull();
  });

  it("volá showTripReportExtern s ud rozsahom a filtruje vozidlá", async () => {
    fronta.push({
      body: JSON.stringify([
        JAZDA,
        { ...JAZDA, tripid: "4712", objectuid: "iné", objectno: "002" },
      ]),
    });
    const j = await adapter.jazdy(
      P,
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-10-30T00:00:00Z"),
      ["1-23456-789ABCDEF"],
    );
    expect(j.map((x) => x.externeId)).toEqual(["4711"]);
    const u = volania[0];
    expect(u.searchParams.get("action")).toBe("showTripReportExtern");
    expect(u.searchParams.get("range_pattern")).toBe("ud");
    expect(u.searchParams.get("rangefrom_string")).toBe("2026-10-01T00:00:00Z");
    expect(u.searchParams.get("rangeto_string")).toBe("2026-10-30T00:00:00Z");
  });

  it("dlhé obdobie delí na okná a čaká minútu medzi volaniami", async () => {
    expect(oknaObdobia(new Date("2026-01-01Z"), new Date("2026-03-01Z")).length).toBe(2);
    _nastavPreTest({ maxCakanieMs: 120_000 });
    const cakania: number[] = [];
    let cas = 0;
    _nastavPreTest({
      teraz: () => cas,
      cakaj: async (ms) => {
        cakania.push(ms);
        cas += ms;
      },
    });
    fronta.push({ body: JSON.stringify([JAZDA]) }, { body: JSON.stringify([JAZDA]) });
    const j = await adapter.jazdy(P, new Date("2026-01-01Z"), new Date("2026-03-01Z"));
    expect(volania.length).toBe(2);
    expect(cakania).toEqual([66_000]);
    expect(j.length).toBe(1); // tá istá jazda z dvoch okien len raz
  });

  it("radšej vráti chybu „limit“, než by čakal dlhšie ako strop", async () => {
    fronta.push({ body: "[]" });
    await adapter.jazdy(P, new Date("2026-10-01Z"), new Date("2026-10-02Z"));
    await expect(
      adapter.jazdy(P, new Date("2026-10-01Z"), new Date("2026-10-02Z")),
    ).rejects.toMatchObject({
      druh: "limit",
    });
    expect(volania.length).toBe(1);
  });

  it("volania idú za sebou, nie paralelne", async () => {
    let bezi = 0;
    let najviac = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        bezi++;
        najviac = Math.max(najviac, bezi);
        await new Promise((r) => setTimeout(r, 5));
        bezi--;
        return new Response("[]", { status: 200 });
      }),
    );
    await Promise.all([adapter.vozidla(P), adapter.test(P), adapter.vozidla(P)]);
    expect(najviac).toBe(1);
  });
});

describe("chyby", () => {
  it("zlé prihlásenie z hlavičky X-Webfleet-Errorcode", async () => {
    fronta.push({
      body: "1106, Authentication failed. check account/username/password.",
      headers: {
        "x-webfleet-errorcode": "1106",
        "x-webfleet-errormessage": "Authentication failed.",
        "content-type": "text/plain",
      },
    });
    const e = await adapter.test(P).catch((x) => x);
    expect(e).toBeInstanceOf(GpsChyba);
    expect(e.druh).toBe("prihlasenie");
    expect(e.message).not.toContain("tajne-heslo");
  });

  it("zlý API kľúč a limit z tela", async () => {
    fronta.push({ body: "1143, API key is invalid", headers: { "content-type": "text/plain" } });
    await expect(adapter.test(P)).rejects.toMatchObject({ druh: "prihlasenie" });
    _nastavPreTest({});
    fronta.push({
      body: "8011, Request quota reached. More than n requests in t seconds are not permitted",
      headers: { "content-type": "text/plain" },
    });
    await expect(adapter.vozidla(P)).rejects.toMatchObject({ druh: "limit" });
  });

  it("63 „document is empty“ je prázdny výsledok", async () => {
    fronta.push({ body: "63, document is empty", headers: { "x-webfleet-errorcode": "63" } });
    expect(await adapter.vozidla(P)).toEqual([]);
  });

  it("chyba siete neprezradí heslo z URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        throw new TypeError(`fetch failed ${url}`);
      }),
    );
    const e = await adapter.test(P).catch((x) => x);
    expect(e).toMatchObject({ druh: "siet" });
    expect(e.message).not.toContain("tajne-heslo");
  });

  it("chýbajúci API kľúč sa ani neposiela", async () => {
    await expect(adapter.test({ ...P, apikey: "" })).rejects.toMatchObject({ druh: "prihlasenie" });
    expect(volania.length).toBe(0);
  });

  it("rozoberChybu pozná CSV aj JSON tvar", () => {
    expect(rozoberChybu("8011, Request quota reached")).toEqual([8011, "Request quota reached"]);
    expect(rozoberChybu('{"errorCode":1106,"errorMsg":"auth"}')).toEqual([1106, "auth"]);
    expect(rozoberChybu("[]")).toBeNull();
  });
});

describe("súkromná jazda späť", () => {
  it("updateLogbook s logflag 1 / 2", async () => {
    fronta.push({ body: "" }, { body: "" });
    await adapter.oznacSukromnu!(P, "4711", true);
    await adapter.oznacSukromnu!(P, "4711", false);
    expect(volania[0].searchParams.get("action")).toBe("updateLogbook");
    expect(volania[0].searchParams.get("tripid")).toBe("4711");
    expect(volania[0].searchParams.get("logflag")).toBe("1");
    expect(volania[1].searchParams.get("logflag")).toBe("2");
  });
});
