import { afterEach, describe, expect, it, vi } from "vitest";
import { GpsChyba } from "./typy";
import {
  adapter,
  miestnyCas,
  naIso,
  okna,
  palivoveKarty,
  soapObalka,
  WD_NS,
  WD_URL,
} from "./webdispecink.server";

/**
 * Podvrhnuté odpovede podľa WSDL https://api.webdispecink.cz/code/WebDispecinkServiceNet.php?wsdl
 * (rpc/literal, `<ns1:_metodaResponse><return>…</return>`, polia ako `<item>`) a popisov metód
 * na https://developers.webdispecink.cz/guides/function/<metóda>:
 * _login, _getCarsList2, _getCarInfo, _getCarLogBook4, _updateBookPrivate, _getCarCosts, _getFuelCards.
 */

const P = { kodf: "FIRMA1", meno: "api.faktero", heslo: "Tajne-Heslo-123" };

function obal(metoda: string, vnutro: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="${WD_NS}">` +
    `<SOAP-ENV:Body><ns1:${metoda}Response>${vnutro}</ns1:${metoda}Response></SOAP-ENV:Body></SOAP-ENV:Envelope>`
  );
}

function fault(text: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body>` +
    `<SOAP-ENV:Fault><faultcode>SOAP-ENV:Server</faultcode><faultstring>${text}</faultstring></SOAP-ENV:Fault>` +
    `</SOAP-ENV:Body></SOAP-ENV:Envelope>`
  );
}

const CARS_LIST2 = obal(
  "_getCarsList2",
  `<return>
    <item><cargroupid>0</cargroupid><carid>1501</carid><identifikator>BA123XY</identifikator><driver>Ján Novák</driver>
      <mobil></mobil><userrights>3</userrights><type>4</type><online>1</online><disabled>0</disabled>
      <gpsmobil>+421900000000</gpsmobil><imei>356000000000001</imei><sn>A1</sn><unittype>12</unittype>
      <odometerKm>182344</odometerKm><installationdate>01.02.2023</installationdate></item>
    <item><cargroupid>0</cargroupid><carid>1502</carid><identifikator>1AB2345</identifikator><driver></driver>
      <type>6</type><online>0</online><disabled>0</disabled><odometerKm></odometerKm></item>
  </return>`,
);

const CAR_INFO = obal(
  "_getCarInfo",
  `<return><item><IdCar>1501</IdCar><Identifikator>BA123XY</Identifikator><Dealer>Eurowag</Dealer><Firma>Firma s.r.o.</Firma>
    <Mobil>+421900000000</Mobil><Principid>777</Principid><Sn>A1</Sn><TovZn>Iveco</TovZn><Model>Daily</Model>
    <VerifiedVIN>ZCFC135A005123456</VerifiedVIN></item></return>`,
);

const LOGBOOK4 = obal(
  "_getCarLogBook4",
  `<return>
    <item><Dt_from>2026-10-01 05:12:00</Dt_from><Dt_to>2026-10-01 07:40:30</Dt_to>
      <Mistood>Bratislava, Mlynské nivy 1</Mistood><Mistodo>Trnava, Hlavná 5</Mistodo><Ucel>Rozvoz</Ucel>
      <Vzdalenost>54.3</Vzdalenost><Tach_start>182000.2</Tach_start><Tach_end>182054.5</Tach_end>
      <Ridic>Ján Novák</Ridic><Oskod>12</Oskod><iddriver>44</iddriver><Druh>0</Druh><Phm>0</Phm>
      <Spotreba>6.1</Spotreba><Id_jizda>9876543210</Id_jizda><Ew_start>48.1486</Ew_start><El_start>17.1077</El_start>
      <Ew_end>48.3774</Ew_end><El_end>17.5872</El_end><Purpose1>Rozvoz</Purpose1><Idcar>1501</Idcar></item>
    <item><Dt_from>2026-10-02 16:00:00</Dt_from><Dt_to>2026-10-02 16:20:00</Dt_to><Mistood>Trnava</Mistood>
      <Mistodo>Trnava</Mistodo><Ucel></Ucel><Vzdalenost>7,5</Vzdalenost><Tach_start>0</Tach_start><Tach_end>0</Tach_end>
      <Ridic></Ridic><Druh>1</Druh><Spotreba>0</Spotreba><Id_jizda>9876543211</Id_jizda>
      <Ew_start>0</Ew_start><El_start>0</El_start><Ew_end>0</Ew_end><El_end>0</El_end><Idcar>1501</Idcar></item>
  </return>`,
);

const CAR_COSTS = obal(
  "_getCarCosts",
  `<return>
    <item><Datum>15.10.2026 08:30</Datum><Cislo>B-1</Cislo><Zdroj>2</Zdroj><Typ>Nafta</Typ><Popis>Tankovanie</Popis>
      <Misto>Slovnaft Senec</Misto><km>182100</km><Mnozstvi>60.5</Mnozstvi><Cenamj>1.30</Cenamj><Cenabezdph>78.65</Cenabezdph>
      <Dph_procent>23</Dph_procent><Dph>18.09</Dph><Cenacelkem>96.74</Cenacelkem><Mena>EUR</Mena><carid>1501</carid>
      <IsFuel>1</IsFuel><IdCost>555</IdCost><Unit>L</Unit></item>
    <item><Datum>16.10.2026 09:00</Datum><Typ>Diaľničná známka</Typ><Mnozstvi>1</Mnozstvi><Cenacelkem>50</Cenacelkem>
      <Mena>EUR</Mena><carid>1501</carid><IsFuel>0</IsFuel><IdCost>556</IdCost></item>
    <item><Datum>17.10.2026 20:00</Datum><Typ>Nabíjanie</Typ><Mnozstvi>40</Mnozstvi><carid>1501</carid>
      <IsFuel>3</IsFuel><IdCost>557</IdCost><Unit>kWh</Unit></item>
  </return>`,
);

type Volanie = { metoda: string; telo: string; hlavicky: Record<string, string> };

function podvrhni(odpovede: Record<string, string | ((telo: string) => string)>, status = 200) {
  const volania: Volanie[] = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe(WD_URL);
    const telo = String(init.body);
    const metoda = telo.match(/<ns1:(_\w+)>/)?.[1] ?? "?";
    volania.push({ metoda, telo, hlavicky: init.headers as Record<string, string> });
    const o = odpovede[metoda];
    if (o === undefined)
      return new Response(fault(`Procedure ${metoda} not mocked`), { status: 500 });
    return new Response(typeof o === "function" ? o(telo) : o, { status });
  });
  vi.stubGlobal("fetch", f);
  return volania;
}

afterEach(() => vi.unstubAllGlobals());

describe("soapObalka", () => {
  it("skladá rpc/literal obálku a escapuje hodnoty", () => {
    const x = soapObalka("_login", [
      ["kodf", "A&B"],
      ["pass", "<x>"],
    ]);
    expect(x).toContain(`xmlns:ns1="${WD_NS}"`);
    expect(x).toContain("<ns1:_login><kodf>A&amp;B</kodf><pass>&lt;x&gt;</pass></ns1:_login>");
  });
});

describe("časy", () => {
  it("miestny čas Webdispečinku (leto aj zima)", () => {
    expect(miestnyCas(new Date("2026-07-01T10:00:00Z"))).toBe("01.07.2026 12:00:00");
    expect(miestnyCas(new Date("2026-12-01T10:00:00Z"), false)).toBe("01.12.2026 11:00");
  });

  it("naIso: GMT z knihy jázd a miestny čas z nákladov", () => {
    expect(naIso("2026-10-01 05:12:00", true)).toBe("2026-10-01T05:12:00.000Z");
    expect(naIso("01.10.2026 05:12:00", true)).toBe("2026-10-01T05:12:00.000Z");
    expect(naIso("15.10.2026 08:30", false)).toBe("2026-10-15T06:30:00.000Z");
    expect(naIso("15.12.2026 08:30", false)).toBe("2026-12-15T07:30:00.000Z");
    expect(naIso("", true)).toBeNull();
    expect(naIso("nezmysel", true)).toBeNull();
  });

  it("okna: najviac 60 dní na volanie", () => {
    const o = okna(new Date("2026-01-01T00:00:00Z"), new Date("2026-04-15T00:00:00Z"));
    expect(o.length).toBe(2);
    expect(o[0][1].getTime() - o[0][0].getTime()).toBeLessThan(60 * 86400_000);
    expect(o[1][1].toISOString()).toBe("2026-04-15T00:00:00.000Z");
  });
});

describe("test (_login)", () => {
  it("1 = prihlásený; posiela kód firmy, meno a heslo", async () => {
    const v = podvrhni({ _login: obal("_login", "<return>1</return>") });
    await expect(adapter.test(P)).resolves.toBeUndefined();
    expect(v[0].hlavicky.SOAPAction).toBe(`"${WD_NS}#_login"`);
    expect(v[0].telo).toContain(
      "<kodf>FIRMA1</kodf><username>api.faktero</username><pass>Tajne-Heslo-123</pass>",
    );
  });

  it("0 = zlé údaje → GpsChyba prihlasenie", async () => {
    podvrhni({ _login: obal("_login", "<return>0</return>") });
    await expect(adapter.test(P)).rejects.toMatchObject({ druh: "prihlasenie" });
  });

  it("Access blocked → limit", async () => {
    podvrhni({ _login: fault("Access blocked") }, 500);
    await expect(adapter.test(P)).rejects.toMatchObject({ druh: "limit" });
  });

  it("výpadok siete → siet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(adapter.test(P)).rejects.toMatchObject({ druh: "siet" });
  });

  it("heslo sa nedostane do hlášky chyby", async () => {
    podvrhni({ _login: fault("Internal error for pass Tajne-Heslo-123") }, 500);
    const e = await adapter.test(P).catch((x) => x);
    expect(e).toBeInstanceOf(GpsChyba);
    expect(e.message).not.toContain("Tajne-Heslo-123");
  });
});

describe("vozidla", () => {
  it("_getCarsList2 + _getCarInfo", async () => {
    podvrhni({ _getCarsList2: CARS_LIST2, _getCarInfo: CAR_INFO });
    expect(await adapter.vozidla(P)).toEqual([
      {
        externeId: "1501",
        spz: "BA123XY",
        nazov: "Iveco Daily",
        vin: "ZCFC135A005123456",
        tachometerKm: 182344,
      },
      { externeId: "1502", spz: "1AB2345", nazov: null, vin: null, tachometerKm: null },
    ]);
  });

  it("bez práva na _getCarInfo ostanú vozidlá bez názvu", async () => {
    podvrhni({ _getCarsList2: CARS_LIST2 });
    const v = await adapter.vozidla(P);
    expect(v.map((x) => x.nazov)).toEqual([null, null]);
  });

  it("jedno vozidlo (item nie je pole) aj prázdny zoznam", async () => {
    podvrhni({
      _getCarsList2: obal(
        "_getCarsList2",
        "<return><item><carid>7</carid><identifikator>ZA001AA</identifikator></item></return>",
      ),
      _getCarInfo: obal("_getCarInfo", "<return/>"),
    });
    expect((await adapter.vozidla(P)).map((v) => v.spz)).toEqual(["ZA001AA"]);
    podvrhni({ _getCarsList2: obal("_getCarsList2", "<return></return>") });
    expect(await adapter.vozidla(P)).toEqual([]);
  });
});

describe("jazdy (_getCarLogBook4)", () => {
  it("mapuje knihu jázd a pýta sa v miestnom čase", async () => {
    const v = podvrhni({ _getCarLogBook4: LOGBOOK4 });
    const j = await adapter.jazdy(
      P,
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-10-03T00:00:00Z"),
      ["1501"],
    );
    expect(v).toHaveLength(1);
    expect(v[0].telo).toContain(
      "<carid>1501</carid><casod>01.10.2026 02:00:00</casod><casdo>03.10.2026 02:00:00</casdo>",
    );
    expect(j).toHaveLength(2);
    expect(j[0]).toMatchObject({
      externeId: "9876543210",
      vozidloExterneId: "1501",
      zaciatok: "2026-10-01T05:12:00.000Z",
      koniec: "2026-10-01T07:40:30.000Z",
      odAdresa: "Bratislava, Mlynské nivy 1",
      doAdresa: "Trnava, Hlavná 5",
      odLat: 48.1486,
      odLng: 17.1077,
      doLat: 48.3774,
      doLng: 17.5872,
      km: 54.3,
      tachometerZaciatok: 182000.2,
      tachometerKoniec: 182054.5,
      vodic: "Ján Novák",
      sukromna: false,
      ucel: "Rozvoz",
      spotrebaL: 6.1,
    });
    expect(j[1]).toMatchObject({
      externeId: "9876543211",
      km: 7.5,
      sukromna: true,
      vodic: null,
      ucel: null,
      odLat: null,
      spotrebaL: null,
    });
  });

  it("bez zoznamu vozidiel prejde všetky a dlhé obdobie delí na 60-dňové okná", async () => {
    const v = podvrhni({
      _getCarsList2: CARS_LIST2,
      _getCarInfo: CAR_INFO,
      _getCarLogBook4: LOGBOOK4,
    });
    const j = await adapter.jazdy(
      P,
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-10-15T00:00:00Z"),
    );
    // 2 vozidlá × 3 okná
    expect(v.filter((x) => x.metoda === "_getCarLogBook4")).toHaveLength(6);
    // tie isté Id_jizda z viacerých okien sa nezdvojujú
    expect(j.map((x) => x.externeId).sort()).toEqual(["9876543210", "9876543211"]);
  });
});

describe("tankovania (_getCarCosts)", () => {
  it("berie len palivo v litroch", async () => {
    podvrhni({ _getCarsList2: CARS_LIST2, _getCarInfo: CAR_INFO, _getCarCosts: CAR_COSTS });
    const t = await adapter.tankovania!(
      P,
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-10-31T00:00:00Z"),
    );
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({
      externeId: "555",
      vozidloExterneId: "1501",
      spz: "BA123XY",
      cas: "2026-10-15T06:30:00.000Z",
      litre: 60.5,
      suma: 96.74,
      mena: "EUR",
      palivo: "Nafta",
      miesto: "Slovnaft Senec",
      tachometerKm: 182100,
    });
  });
});

describe("oznacSukromnu (_updateBookPrivate)", () => {
  it("posiela idjizda a privateroute", async () => {
    const v = podvrhni({ _updateBookPrivate: obal("_updateBookPrivate", "<return>1</return>") });
    await adapter.oznacSukromnu!(P, "9876543210", true);
    expect(v[0].telo).toContain("<idjizda>9876543210</idjizda><privateroute>1</privateroute>");
    await adapter.oznacSukromnu!(P, "9876543210", false);
    expect(v[1].telo).toContain("<privateroute>0</privateroute>");
  });

  it("chybové kódy", async () => {
    podvrhni({ _updateBookPrivate: obal("_updateBookPrivate", "<return>0</return>") });
    await expect(adapter.oznacSukromnu!(P, "1", true)).rejects.toMatchObject({
      druh: "prihlasenie",
    });
    podvrhni({ _updateBookPrivate: obal("_updateBookPrivate", "<return>-3</return>") });
    await expect(adapter.oznacSukromnu!(P, "1", true)).rejects.toThrow(/uzamknutá/);
    await expect(adapter.oznacSukromnu!(P, "1; DROP", true)).rejects.toMatchObject({
      druh: "api",
    });
  });
});

describe("palivoveKarty (_getFuelCards)", () => {
  it("vráti karty bez PIN", async () => {
    podvrhni({
      _getFuelCards: obal(
        "_getFuelCards",
        `<return><item><id>3</id><card_number>7002 1234 5678</card_number><pin>1234</pin><type>EW</type>
          <assign>1</assign><assign_id>1501</assign_id><is_inactive>0</is_inactive>
          <expiration_date>2028-01-31</expiration_date><note></note></item></return>`,
      ),
    });
    const k = await palivoveKarty(P);
    expect(k).toEqual([
      {
        externeId: "3",
        cislo: "7002 1234 5678",
        typ: "EW",
        priradenie: "vozidlo",
        priradenieId: "1501",
        aktivna: true,
        platnostDo: "2028-01-31",
        poznamka: null,
      },
    ]);
    expect(JSON.stringify(k)).not.toContain('1234"');
  });
});
