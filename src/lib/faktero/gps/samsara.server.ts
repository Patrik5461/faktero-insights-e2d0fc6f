/**
 * Samsara — adaptér GPS cez REST API (https://api.samsara.com), Bearer API token zákazníka.
 *
 * Dokumentácia:
 *  - prehľad, autentifikácia, stránkovanie (pagination.endCursor / hasNextPage, parameter `after`):
 *    https://developers.samsara.com/docs/rest-api-overview
 *  - vozidlá: GET /fleet/vehicles — https://developers.samsara.com/reference/listvehicles
 *  - stav tachometra: GET /fleet/vehicles/stats?types=obdOdometerMeters,gpsOdometerMeters
 *    https://developers.samsara.com/reference/getvehiclestats
 *  - vodiči: GET /fleet/drivers — https://developers.samsara.com/reference/listdrivers
 *  - jazdy (aktuálne): GET /trips/stream — https://developers.samsara.com/reference/gettrips
 *    Parametre startTime/endTime (RFC 3339), ids (max 50 vozidiel), queryBy=tripStartTime,
 *    completionStatus=completed. Trip nemá vlastné id ani vodiča; vzdialenosť `finalDistanceMeters`.
 *    API je podľa dokumentácie „Closed Beta“ — token potrebuje právo „Read Trips“ a Samsara ho
 *    musí organizácii zapnúť. Keď odpovie 403/404, prepneme na starší endpoint nižšie.
 *  - jazdy (legacy): GET /v1/fleet/trips?vehicleId&startMs&endMs (okno najviac 90 dní).
 *    Odpoveď {"trips":[{startMs,endMs,startLocation,endLocation,startCoordinates,endCoordinates,
 *    distanceMeters,fuelConsumedMl,driverId,startOdometer,endOdometer,...}]}; odometer v metroch
 *    (0 = nečitateľný), prebiehajúca jazda má endMs 9223372036854775807.
 *
 * Čo Samsara nevie / nerobíme:
 *  - Tankovania: API má len POST /fuel-purchase (zápis nákupu z palivovej karty), zoznam čítať
 *    nejde → metóda `tankovania` chýba.
 *  - Súkromná jazda: ani jeden endpoint jázd nemá príznak súkromnej jazdy (tripPurpose je len pri
 *    licencii „mileage reporting“) → `sukromna` z tripPurpose, inak null; zápis späť API nemá.
 */
import { GpsChyba, type GpsAdapter, type GpsJazda, type GpsVozidlo } from "./typy";

const BASE = "https://api.samsara.com";
const DEN_MS = 86_400_000;
/** /v1/fleet/trips dovolí okno najviac 90 dní. */
const LEGACY_OKNO_MS = 90 * DEN_MS;
/** /trips/stream berie najviac 50 vozidiel naraz. */
const STREAM_DAVKA = 50;

type Stranka<T> = { data: T[]; pagination?: { endCursor?: string; hasNextPage?: boolean } };

type SamsaraVozidlo = {
  id: string;
  name?: string;
  licensePlate?: string;
  vin?: string;
  externalIds?: Record<string, string>;
};

type SamsaraStat = {
  id: string;
  obdOdometerMeters?: { time: string; value: number };
  gpsOdometerMeters?: { time: string; value: number };
};

type SamsaraAdresa = {
  street?: string;
  streetNumber?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  neighborhood?: string;
  pointOfInterest?: string;
};

type SamsaraMiesto = {
  latitude: number;
  longitude: number;
  headingDegrees?: number;
  accuracyMeters?: number;
  address?: SamsaraAdresa;
};

type SamsaraTrip = {
  asset: { id: string; name?: string; type?: string; vin?: string };
  completionStatus: "inProgress" | "completed";
  createdAtTime: string;
  updatedAtTime: string;
  tripStartTime: string;
  tripEndTime?: string | null;
  startLocation: SamsaraMiesto;
  endLocation?: SamsaraMiesto | null;
  finalDistanceMeters?: number | null;
  tripPurpose?: string | null;
};

type SamsaraV1Trip = {
  startMs: number;
  endMs: number;
  startLocation?: string;
  endLocation?: string;
  startCoordinates?: { latitude: number; longitude: number };
  endCoordinates?: { latitude: number; longitude: number };
  distanceMeters?: number;
  fuelConsumedMl?: number;
  driverId?: number;
  startOdometer?: number;
  endOdometer?: number;
};

class NedostupnyEndpoint extends Error {}

function token(p: Record<string, string>): string {
  const t = (p.token ?? "").trim().replace(/^Bearer\s+/i, "");
  if (!t) throw new GpsChyba("prihlasenie", "Zadajte API token zo Samsary.");
  return t;
}

async function volaj<T>(
  tok: string,
  cesta: string,
  query: Record<string, string | number | undefined>,
  opt: { nedostupny?: boolean } = {},
): Promise<T> {
  const u = new URL(BASE + cesta);
  for (const [k, v] of Object.entries(query)) if (v !== undefined) u.searchParams.set(k, String(v));
  let odp: Response;
  try {
    odp = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" },
    });
  } catch {
    throw new GpsChyba("siet", "Samsara je nedostupná.");
  }
  if (odp.status === 401) {
    throw new GpsChyba("prihlasenie", "Samsara odmietla API token — skontrolujte ho.");
  }
  if (opt.nedostupny && (odp.status === 403 || odp.status === 404)) {
    throw new NedostupnyEndpoint();
  }
  if (odp.status === 403) {
    throw new GpsChyba(
      "prihlasenie",
      "API token nemá potrebné oprávnenia (čítanie vozidiel a jázd).",
    );
  }
  if (odp.status === 429) {
    throw new GpsChyba("limit", "Samsara: prekročený limit volaní, skúste to o chvíľu.");
  }
  if (!odp.ok) throw new GpsChyba("api", `Samsara odpovedala stavom ${odp.status}.`);
  try {
    return (await odp.json()) as T;
  } catch {
    throw new GpsChyba("api", "Samsara vrátila nečitateľnú odpoveď.");
  }
}

async function vsetkyStranky<T>(
  tok: string,
  cesta: string,
  query: Record<string, string | number | undefined>,
  opt: { nedostupny?: boolean } = {},
): Promise<T[]> {
  const vysledok: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < 1000; i++) {
    const s = await volaj<Stranka<T>>(tok, cesta, { ...query, after }, opt);
    vysledok.push(...(s.data ?? []));
    const dalsia = s.pagination?.endCursor;
    if (!s.pagination?.hasNextPage || !dalsia) break;
    after = dalsia;
  }
  return vysledok;
}

function prazdne(s: string | undefined | null): string | null {
  const t = (s ?? "").trim();
  return t ? t : null;
}

export function adresaZoSamsary(a: SamsaraAdresa | undefined): string | null {
  if (!a) return null;
  const ulica = [a.street, a.streetNumber].filter((x) => x?.trim()).join(" ");
  const mesto = [a.postalCode, a.city].filter((x) => x?.trim()).join(" ");
  const casti = [a.pointOfInterest, ulica, mesto, a.country].map((x) => x?.trim()).filter(Boolean);
  return casti.length ? casti.join(", ") : null;
}

/** Trip nemá id — kľúčom je vozidlo + čas začiatku (rovnaký v novom aj starom endpointe). */
function idJazdy(vozidlo: string, zaciatokMs: number): string {
  return `${vozidlo}-${zaciatokMs}`;
}

function sukromnaZUcelu(ucel: string | null | undefined): boolean | null {
  if (!ucel) return null;
  if (/personal|private/i.test(ucel)) return true;
  if (/business/i.test(ucel)) return false;
  return null;
}

export function prevedStreamJazdy(trips: SamsaraTrip[]): GpsJazda[] {
  return trips
    .filter((t) => t.completionStatus === "completed" && t.tripEndTime)
    .map((t) => {
      const zac = Date.parse(t.tripStartTime);
      return {
        externeId: idJazdy(t.asset.id, zac),
        vozidloExterneId: t.asset.id,
        zaciatok: new Date(zac).toISOString(),
        koniec: new Date(t.tripEndTime!).toISOString(),
        odAdresa: adresaZoSamsary(t.startLocation?.address),
        doAdresa: adresaZoSamsary(t.endLocation?.address ?? undefined),
        odLat: t.startLocation?.latitude ?? null,
        odLng: t.startLocation?.longitude ?? null,
        doLat: t.endLocation?.latitude ?? null,
        doLng: t.endLocation?.longitude ?? null,
        km: Math.round((t.finalDistanceMeters ?? 0) / 10) / 100,
        vodic: null,
        sukromna: sukromnaZUcelu(t.tripPurpose),
        ucel: prazdne(t.tripPurpose),
        surove: t,
      };
    });
}

export function prevedV1Jazdy(
  vozidlo: string,
  trips: SamsaraV1Trip[],
  vodici: Map<string, string>,
): GpsJazda[] {
  return (
    trips
      // prebiehajúca jazda má endMs = Long.MAX (po JSON.parse ~9.22e18)
      .filter((t) => t.endMs && t.endMs < 1e15)
      .map((t) => {
        const odo = (m: number | undefined) => (m && m > 0 ? Math.round(m / 100) / 10 : null);
        const ml = t.fuelConsumedMl ?? 0;
        return {
          externeId: idJazdy(vozidlo, t.startMs),
          vozidloExterneId: vozidlo,
          zaciatok: new Date(t.startMs).toISOString(),
          koniec: new Date(t.endMs).toISOString(),
          odAdresa: prazdne(t.startLocation),
          doAdresa: prazdne(t.endLocation),
          odLat: t.startCoordinates?.latitude ?? null,
          odLng: t.startCoordinates?.longitude ?? null,
          doLat: t.endCoordinates?.latitude ?? null,
          doLng: t.endCoordinates?.longitude ?? null,
          km: Math.round((t.distanceMeters ?? 0) / 10) / 100,
          tachometerZaciatok: odo(t.startOdometer),
          tachometerKoniec: odo(t.endOdometer),
          vodic: t.driverId ? (vodici.get(String(t.driverId)) ?? null) : null,
          sukromna: null,
          // komunita hlási pretečené hodnoty (miliardy ml) — nezmysel nad 1000 l zahodíme
          spotrebaL: ml > 0 && ml < 1_000_000 ? Math.round(ml / 10) / 100 : null,
          surove: t,
        };
      })
  );
}

async function idVozidiel(tok: string): Promise<string[]> {
  const v = await vsetkyStranky<SamsaraVozidlo>(tok, "/fleet/vehicles", { limit: 512 });
  return v.map((x) => x.id);
}

async function jazdyStream(tok: string, ids: string[], od: Date, do_: Date) {
  const vysledok: SamsaraTrip[] = [];
  for (let i = 0; i < ids.length; i += STREAM_DAVKA) {
    vysledok.push(
      ...(await vsetkyStranky<SamsaraTrip>(
        tok,
        "/trips/stream",
        {
          startTime: od.toISOString(),
          endTime: do_.toISOString(),
          ids: ids.slice(i, i + STREAM_DAVKA).join(","),
          queryBy: "tripStartTime",
          completionStatus: "completed",
        },
        { nedostupny: true },
      )),
    );
  }
  return prevedStreamJazdy(vysledok);
}

async function jazdyV1(tok: string, ids: string[], od: Date, do_: Date) {
  const vodici = new Map<string, string>();
  const jazdy: { vozidlo: string; trips: SamsaraV1Trip[] }[] = [];
  for (const id of ids) {
    for (let zac = od.getTime(); zac < do_.getTime(); zac += LEGACY_OKNO_MS) {
      const kon = Math.min(zac + LEGACY_OKNO_MS, do_.getTime());
      const r = await volaj<{ trips?: SamsaraV1Trip[] }>(tok, "/v1/fleet/trips", {
        vehicleId: id,
        startMs: zac,
        endMs: kon,
      });
      jazdy.push({ vozidlo: id, trips: r.trips ?? [] });
    }
  }
  if (jazdy.some((j) => j.trips.some((t) => t.driverId))) {
    const d = await vsetkyStranky<{ id: string; name?: string }>(tok, "/fleet/drivers", {
      limit: 512,
    });
    for (const x of d) if (x.name?.trim()) vodici.set(String(x.id), x.name.trim());
  }
  return jazdy.flatMap((j) => prevedV1Jazdy(j.vozidlo, j.trips, vodici));
}

export const adapter: GpsAdapter = {
  id: "samsara",
  nazov: "Samsara",
  web: "https://www.samsara.com",
  dokumentacia: "https://developers.samsara.com/docs/rest-api-overview",
  polia: [
    {
      kluc: "token",
      nazov: "API token",
      typ: "heslo",
      povinne: true,
      pomoc:
        "Samsara → Settings → API Tokens; oprávnenia na čítanie vozidiel, vodičov a jázd (Read Trips).",
    },
  ],

  async test(p) {
    await volaj(token(p), "/fleet/vehicles", { limit: 1 });
  },

  async vozidla(p) {
    const tok = token(p);
    const v = await vsetkyStranky<SamsaraVozidlo>(tok, "/fleet/vehicles", { limit: 512 });
    const tacho = new Map<string, number>();
    try {
      const s = await vsetkyStranky<SamsaraStat>(tok, "/fleet/vehicles/stats", {
        types: "obdOdometerMeters,gpsOdometerMeters",
      });
      for (const x of s) {
        const m = x.obdOdometerMeters?.value ?? x.gpsOdometerMeters?.value;
        if (m && m > 0) tacho.set(x.id, Math.round(m / 1000));
      }
    } catch (e) {
      // tachometer je len doplnok — token bez práva na štatistiky nesmie zhodiť zoznam vozidiel
      if (e instanceof GpsChyba && e.druh === "siet") throw e;
    }
    return v.map((x): GpsVozidlo => ({
      externeId: x.id,
      spz: prazdne(x.licensePlate),
      nazov: prazdne(x.name),
      vin: prazdne(x.vin),
      tachometerKm: tacho.get(x.id) ?? null,
    }));
  },

  async jazdy(p, od, do_, vozidla) {
    const tok = token(p);
    const ids = vozidla?.length ? vozidla : await idVozidiel(tok);
    if (!ids.length) return [];
    try {
      return await jazdyStream(tok, ids, od, do_);
    } catch (e) {
      if (!(e instanceof NedostupnyEndpoint)) throw e;
      return jazdyV1(tok, ids, od, do_);
    }
  },
};
