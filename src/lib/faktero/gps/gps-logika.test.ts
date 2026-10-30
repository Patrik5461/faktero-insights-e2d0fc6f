import { describe, expect, it } from "vitest";
import {
  bezTajomstiev,
  chybajucePolia,
  jazdaNaTrip,
  najblizsiaSkupina,
  normalizujSpz,
  oknoStahovania,
  rozdelPrihlasenie,
  tankovanieNaRiadok,
  trebaSynchronizovat,
  zlucPrihlasenie,
} from "./gps-logika";
import type { GpsJazda, GpsPole } from "./typy";

const POLIA: GpsPole[] = [
  { kluc: "login", nazov: "Prihlasovacie meno", typ: "text", povinne: true },
  { kluc: "heslo", nazov: "Heslo", typ: "heslo", povinne: true },
  { kluc: "server", nazov: "Server", typ: "url", povinne: false },
];

const CTX = {
  companyId: "c1",
  vehicleId: "v1",
  poskytovatel: "gpsdozor",
  nazovPoskytovatela: "GPS Dozor",
  pripojenieId: "p1",
  teraz: new Date("2026-10-30T12:00:00Z"),
};

const JAZDA: GpsJazda = {
  externeId: "11297252",
  vozidloExterneId: "ZODIDOZEBU",
  zaciatok: "2026-10-28T05:57:04.000Z",
  koniec: "2026-10-28T06:35:12.000Z",
  odAdresa: "Bratislava",
  doAdresa: " ",
  odLat: 48.1,
  odLng: 17.1,
  doLat: 48.2,
  doLng: 17.2,
  km: 43.286,
  tachometerZaciatok: 539559,
  tachometerKoniec: 539602,
  vodic: "Jaroslav Slaný",
  sukromna: false,
  ucel: null,
  spotrebaL: 3.5,
};

describe("normalizujSpz", () => {
  it("ignoruje medzery, pomlčky a veľkosť písmen", () => {
    expect(normalizujSpz("ba-123 cd")).toBe("BA123CD");
    expect(normalizujSpz("4EG 34-55")).toBe(normalizujSpz("4eg3455"));
    expect(normalizujSpz(null)).toBe("");
  });
});

describe("oknoStahovania", () => {
  const teraz = new Date("2026-10-30T12:00:00Z");
  it("prvé stiahnutie = posledných 30 dní", () => {
    const o = oknoStahovania(null, teraz)!;
    expect(o.od.toISOString()).toBe("2026-09-30T12:00:00.000Z");
    expect(o.do_.toISOString()).toBe(teraz.toISOString());
  });
  it("ďalšie behy od kurzora s prekryvom 2 dni", () => {
    const o = oknoStahovania("2026-10-29T03:00:00.000Z", teraz)!;
    expect(o.od.toISOString()).toBe("2026-10-27T03:00:00.000Z");
  });
  it("kurzor po teraz = aktuálne", () => {
    expect(oknoStahovania(teraz.toISOString(), teraz)).toBeNull();
  });
  it("starý kurzor neťahá viac ako 30 dní", () => {
    const o = oknoStahovania("2025-01-01T00:00:00Z", teraz)!;
    expect(o.od.toISOString()).toBe("2026-09-30T12:00:00.000Z");
  });
});

describe("najblizsiaSkupina", () => {
  const teraz = new Date("2026-10-30T12:00:00Z");
  it("vozidlá s rovnakým kurzorom idú spolu, najstarší najprv", () => {
    const s = najblizsiaSkupina(
      [
        { id: "a", jazdyDo: "2026-10-29T12:00:00Z" },
        { id: "b", jazdyDo: null },
        { id: "c", jazdyDo: null },
        { id: "d", jazdyDo: teraz.toISOString() },
      ],
      teraz,
    )!;
    expect(s.ids).toEqual(["b", "c"]);
    expect(s.okno.od.toISOString()).toBe("2026-09-30T12:00:00.000Z");
  });
  it("všetko aktuálne = null", () => {
    expect(najblizsiaSkupina([{ id: "a", jazdyDo: teraz.toISOString() }], teraz)).toBeNull();
  });
  it("posun okien vždy skončí", () => {
    let kurzor: string | null = "2026-01-01T00:00:00Z";
    let krokov = 0;
    for (;;) {
      const s = najblizsiaSkupina([{ id: "a", jazdyDo: kurzor }], teraz);
      if (!s) break;
      kurzor = s.okno.do_.toISOString();
      expect(++krokov).toBeLessThan(5);
    }
  });
});

describe("trebaSynchronizovat", () => {
  const zaklad = { aktivne: true, auto_sync: true, neuplne: false };
  it("nové a nedokončené vždy", () => {
    const den = new Date("2026-10-30T12:00:00Z");
    expect(trebaSynchronizovat({ ...zaklad, posledna_sync_at: null }, den)).toBe(true);
    expect(
      trebaSynchronizovat(
        { ...zaklad, neuplne: true, posledna_sync_at: "2026-10-30T11:50:00Z" },
        den,
      ),
    ).toBe(true);
  });
  it("v noci raz", () => {
    const noc = new Date("2026-10-30T02:00:00Z");
    expect(trebaSynchronizovat({ ...zaklad, posledna_sync_at: "2026-10-29T20:00:00Z" }, noc)).toBe(
      true,
    );
    expect(trebaSynchronizovat({ ...zaklad, posledna_sync_at: "2026-10-30T01:00:00Z" }, noc)).toBe(
      false,
    );
    expect(
      trebaSynchronizovat(
        { ...zaklad, posledna_sync_at: "2026-10-29T20:00:00Z" },
        new Date("2026-10-30T12:00:00Z"),
      ),
    ).toBe(false);
  });
  it("vypnuté nikdy", () => {
    expect(
      trebaSynchronizovat({ ...zaklad, auto_sync: false, posledna_sync_at: null }, new Date()),
    ).toBe(false);
  });
});

describe("jazdaNaTrip", () => {
  it("prevedie jazdu na riadok knihy jázd", () => {
    const r = jazdaNaTrip(JAZDA, CTX);
    expect("riadok" in r).toBe(true);
    if (!("riadok" in r)) return;
    expect(r.riadok).toMatchObject({
      company_id: "c1",
      vehicle_id: "v1",
      trip_date: "2026-10-28",
      driver_name: "Jaroslav Slaný",
      start_location: "Bratislava",
      end_location: null,
      purpose: "Služobná cesta",
      classification: "business",
      start_odometer: 539559,
      end_odometer: 539602,
      distance_km: 43.29,
      fuel_consumption: 3.5,
      duration_seconds: 2288,
      external_source: "gpsdozor",
      external_id: "11297252",
      note: "Automatický import z GPS Dozor",
    });
    expect((r.riadok.raw_provider_data as any).suradnice).toEqual({
      odLat: 48.1,
      odLng: 17.1,
      doLat: 48.2,
      doLng: 17.2,
    });
  });
  it("súkromná jazda a vlastný účel", () => {
    const r = jazdaNaTrip({ ...JAZDA, sukromna: true }, CTX) as any;
    expect(r.riadok.classification).toBe("private");
    expect(r.riadok.purpose).toBe("Súkromná jazda");
    const r2 = jazdaNaTrip({ ...JAZDA, ucel: "Rozvoz tovaru" }, CTX) as any;
    expect(r2.riadok.purpose).toBe("Rozvoz tovaru");
  });
  it("dopočíta tachometer, keď chýba", () => {
    const r = jazdaNaTrip({ ...JAZDA, tachometerZaciatok: null }, CTX) as any;
    expect(r.riadok.start_odometer).toBe(539558.7);
    const r2 = jazdaNaTrip(
      { ...JAZDA, tachometerZaciatok: null, tachometerKoniec: null },
      CTX,
    ) as any;
    expect(r2.riadok.start_odometer).toBe(0);
    expect(r2.riadok.end_odometer).toBe(43.3);
    // koniec menší ako začiatok by DB odmietla
    const r3 = jazdaNaTrip({ ...JAZDA, tachometerZaciatok: 100, tachometerKoniec: 50 }, CTX) as any;
    expect(r3.riadok.end_odometer).toBeGreaterThanOrEqual(r3.riadok.start_odometer);
  });
  it("preskočí nulovú a neplatnú jazdu", () => {
    expect(jazdaNaTrip({ ...JAZDA, km: 0 }, CTX)).toEqual({ preskoc: "nulova" });
    expect(jazdaNaTrip({ ...JAZDA, koniec: "2026-10-27T00:00:00Z" }, CTX)).toEqual({
      preskoc: "neplatna",
    });
    expect(jazdaNaTrip({ ...JAZDA, zaciatok: "x" }, CTX)).toEqual({ preskoc: "neplatna" });
  });
});

describe("tankovanieNaRiadok", () => {
  it("prevedie tankovanie", () => {
    const r = tankovanieNaRiadok(
      {
        externeId: "t1",
        cas: "2026-10-20T08:00:00Z",
        litre: 50,
        suma: 80,
        mena: "EUR",
        miesto: "Shell Senec",
      },
      CTX,
    )!;
    expect(r).toMatchObject({
      fuel_date: "2026-10-20",
      liters: 50,
      price_per_liter: 1.6,
      total_amount: 80,
      station_name: "Shell Senec",
      external_source: "gpsdozor",
      external_id: "t1",
    });
  });
  it("bez sumy dá nuly, bez litrov nič", () => {
    expect(
      tankovanieNaRiadok({ externeId: "t", cas: "2026-10-20", litre: 10 }, CTX)!.total_amount,
    ).toBe(0);
    expect(tankovanieNaRiadok({ externeId: "t", cas: "2026-10-20", litre: 0 }, CTX)).toBeNull();
  });
});

describe("prihlasovacie údaje", () => {
  it("heslo nejde do verejnej časti", () => {
    const { vsetko, verejne } = rozdelPrihlasenie(POLIA, {
      login: " jan ",
      heslo: "tajne123",
      x: "y",
    });
    expect(vsetko).toEqual({ login: "jan", heslo: "tajne123" });
    expect(verejne).toEqual({ login: "jan" });
  });
  it("prázdne heslo = ponechať uložené", () => {
    expect(
      zlucPrihlasenie(POLIA, { login: "novy", heslo: "" }, { login: "stary", heslo: "s" }),
    ).toEqual({
      login: "novy",
      heslo: "s",
      server: "",
    });
  });
  it("chýbajúce povinné polia", () => {
    expect(chybajucePolia(POLIA, { login: "a" })).toEqual(["Heslo"]);
  });
  it("správa chyby neprezradí heslo", () => {
    expect(
      bezTajomstiev("Zlé heslo tajne123 pre jan", { login: "jan", heslo: "tajne123" }, POLIA),
    ).toBe("Zlé heslo •••• pre jan");
  });
});
