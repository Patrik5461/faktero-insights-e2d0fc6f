/**
 * Geotab (MyGeotab) — adaptér GPS cez JSON-RPC API v1.
 *
 * Dokumentácia:
 *  - koncepty (JSON-RPC, Authenticate, credentials, path):
 *    https://developers.geotab.com/myGeotab/guides/concepts/
 *  - Authenticate: https://developers.geotab.com/myGeotab/apiReference/methods/Authenticate
 *    (chyby InvalidUserException, DbUnavailableException, OverLimitException; 10 volaní/min)
 *  - Trip: https://developers.geotab.com/myGeotab/apiReference/objects/Trip
 *    (distance v km, odometer na konci jazdy v metroch, stopPoint = súradnica zastavenia)
 *  - TripSearch: https://developers.geotab.com/myGeotab/apiReference/objects/TripSearch
 *  - GoDevice (licensePlate, vehicleIdentificationNumber):
 *    https://developers.geotab.com/myGeotab/apiReference/objects/GoDevice
 *  - FuelTransaction (volume v litroch, cost + currencyCode, odometer v km):
 *    https://developers.geotab.com/myGeotab/apiReference/objects/FuelTransaction
 *
 * Postup: POST https://<server>/apiv1 s telom {"method":"Authenticate","params":{database,userName,password}}
 * → {"result":{"credentials":{database,userName,sessionId},"path":"ThisServer"|"<server>"}}.
 * Ďalšie volania nesú `credentials` v `params` a idú na server z `path` (ak nie je „ThisServer“).
 *
 * Čo Geotab nevie / nerobíme:
 *  - Trip nemá súradnicu začiatku; začiatok jazdy = stopPoint predchádzajúcej jazdy toho istého
 *    vozidla (ak je v načítanom okne). Adresy dopĺňa spoločná vrstva cez ORS.
 *  - Súkromná jazda: Trip nemá príznak súkromnej jazdy → `sukromna: null`, zápis späť nie je.
 *  - Spotreba paliva na jazdu nie je v Trip (len cez StatusData diagnostiky) → nevraciame.
 */
import {
  GpsChyba,
  type GpsAdapter,
  type GpsJazda,
  type GpsTankovanie,
  type GpsVozidlo,
} from "./typy";

const PREDVOLENY_SERVER = "my.geotab.com";
/** Strop jedného Get; Geotab dovolí najviac 50 000. */
const LIMIT_ZAZNAMOV = 50000;

type Prihlasenie = { database: string; userName: string; sessionId: string };
type Relacia = { server: string; credentials: Prihlasenie };

type GeotabChyba = {
  code?: number;
  message?: string;
  data?: { type?: string; id?: string; requestIndex?: number };
  errors?: { message?: string; name?: string }[];
  name?: string;
};

type GeotabDevice = {
  id: string;
  name?: string;
  serialNumber?: string;
  licensePlate?: string;
  vehicleIdentificationNumber?: string;
  activeFrom?: string;
  activeTo?: string;
};

type GeotabTrip = {
  id: string;
  device?: { id: string } | string;
  driver?: { id: string } | string;
  start: string;
  stop: string;
  nextTripStart?: string;
  distance?: number;
  odometer?: number;
  stopPoint?: { x: number; y: number };
};

type GeotabUser = { id: string; name?: string; firstName?: string; lastName?: string };

type GeotabFuel = {
  id: string;
  dateTime: string;
  device?: { id: string } | string | null;
  licencePlate?: string;
  volume?: number;
  cost?: number;
  currencyCode?: string;
  odometer?: number;
  productType?: string;
  siteName?: string;
  location?: { x: number; y: number };
};

/** „my.geotab.com“, „https://my123.geotab.com/“ aj „my123.geotab.com/apiv1“ → host. */
export function hostServera(server: string | undefined): string {
  const s = (server ?? "").trim() || PREDVOLENY_SERVER;
  return s
    .replace(/^https?:\/\//i, "")
    .replace(/\/apiv1\/?$/i, "")
    .replace(/\/+$/, "");
}

function idOdkazu(o: { id: string } | string | null | undefined): string | null {
  if (!o) return null;
  return typeof o === "string" ? o : (o.id ?? null);
}

function chybaZGeotabu(e: GeotabChyba): GpsChyba {
  const typ = e.data?.type ?? e.errors?.[0]?.name ?? e.name ?? "";
  const sprava = e.message ?? e.errors?.[0]?.message ?? "";
  if (typ === "InvalidUserException" || /Invalid session/i.test(sprava)) {
    return new GpsChyba("prihlasenie", "Geotab odmietol prihlásenie — skontrolujte meno a heslo.");
  }
  if (typ === "DbUnavailableException") {
    return new GpsChyba(
      "prihlasenie",
      "Geotab databáza nie je dostupná — skontrolujte názov databázy a server.",
    );
  }
  if (typ === "OverLimitException") {
    return new GpsChyba("limit", "Geotab: prekročený limit volaní, skúste to o chvíľu.");
  }
  return new GpsChyba("api", `Geotab vrátil chybu${typ ? ` (${typ})` : ""}.`);
}

async function zavolaj<T>(
  server: string,
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  let odp: Response;
  try {
    odp = await fetch(`https://${server}/apiv1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, params }),
    });
  } catch {
    throw new GpsChyba("siet", `Server Geotab ${server} je nedostupný.`);
  }
  if (odp.status === 429) throw new GpsChyba("limit", "Geotab: prekročený limit volaní.");
  if (!odp.ok) throw new GpsChyba("api", `Geotab odpovedal stavom ${odp.status}.`);
  let telo: { result?: T; error?: GeotabChyba };
  try {
    telo = await odp.json();
  } catch {
    throw new GpsChyba("api", "Geotab vrátil nečitateľnú odpoveď.");
  }
  if (telo.error) throw chybaZGeotabu(telo.error);
  return telo.result as T;
}

async function prihlas(p: Record<string, string>): Promise<Relacia> {
  const database = (p.database ?? "").trim();
  const userName = (p.user ?? "").trim();
  const password = p.password ?? "";
  if (!database || !userName || !password) {
    throw new GpsChyba("prihlasenie", "Vyplňte databázu, používateľa aj heslo.");
  }
  const server = hostServera(p.server);
  const r = await zavolaj<{ credentials: Prihlasenie; path?: string }>(server, "Authenticate", {
    database,
    userName,
    password,
  });
  if (!r?.credentials?.sessionId) {
    throw new GpsChyba("prihlasenie", "Geotab nevrátil reláciu.");
  }
  const cesta = (r.path ?? "").trim();
  return {
    server: cesta && cesta !== "ThisServer" ? hostServera(cesta) : server,
    credentials: r.credentials,
  };
}

function get<T>(rel: Relacia, typeName: string, search?: Record<string, unknown>): Promise<T[]> {
  return zavolaj<T[]>(rel.server, "Get", {
    typeName,
    ...(search ? { search } : {}),
    resultsLimit: LIMIT_ZAZNAMOV,
    credentials: rel.credentials,
  }).then((r) => r ?? []);
}

function cislo(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function prazdne(s: string | undefined | null): string | null {
  const t = (s ?? "").trim();
  return t ? t : null;
}

function menoVodica(u: GeotabUser): string | null {
  const cele = [u.firstName, u.lastName].filter((x) => x && x.trim()).join(" ");
  return prazdne(cele) ?? prazdne(u.name);
}

/** Jazdy z Geotabu → GpsJazda; začiatok berie zo zastavenia predchádzajúcej jazdy vozidla. */
export function prevedJazdy(trips: GeotabTrip[], vodici: Map<string, string>): GpsJazda[] {
  const zoradene = [...trips].sort((a, b) => {
    const da = idOdkazu(a.device) ?? "";
    const db = idOdkazu(b.device) ?? "";
    return da === db ? a.start.localeCompare(b.start) : da.localeCompare(db);
  });
  const vysledok: GpsJazda[] = [];
  let predosla: GeotabTrip | null = null;
  for (const t of zoradene) {
    const vozidlo = idOdkazu(t.device);
    if (!vozidlo) continue;
    const odPredoslej = predosla && idOdkazu(predosla.device) === vozidlo ? predosla : null;
    predosla = t;
    const km = cislo(t.distance) ?? 0;
    // odometer v Trip je v metroch na konci jazdy; 0 = jednotka ho nečíta
    const odoM = cislo(t.odometer);
    const tachoKoniec = odoM && odoM > 0 ? Math.round(odoM / 100) / 10 : null;
    const tachoZaciatok =
      tachoKoniec != null ? Math.max(0, Math.round((tachoKoniec - km) * 10) / 10) : null;
    const vodicId = idOdkazu(t.driver);
    vysledok.push({
      externeId: t.id,
      vozidloExterneId: vozidlo,
      zaciatok: new Date(t.start).toISOString(),
      koniec: new Date(t.stop).toISOString(),
      odLat: odPredoslej?.stopPoint?.y ?? null,
      odLng: odPredoslej?.stopPoint?.x ?? null,
      doLat: t.stopPoint?.y ?? null,
      doLng: t.stopPoint?.x ?? null,
      km: Math.round(km * 1000) / 1000,
      tachometerZaciatok: tachoZaciatok,
      tachometerKoniec: tachoKoniec,
      vodic: vodicId && vodicId !== "UnknownDriverId" ? (vodici.get(vodicId) ?? null) : null,
      sukromna: null,
      surove: t,
    });
  }
  return vysledok;
}

export function prevedTankovania(f: GeotabFuel[]): GpsTankovanie[] {
  return f
    .filter((x) => (cislo(x.volume) ?? 0) > 0)
    .map((x) => {
      const odo = cislo(x.odometer);
      return {
        externeId: x.id,
        vozidloExterneId: idOdkazu(x.device ?? null),
        spz: prazdne(x.licencePlate),
        cas: new Date(x.dateTime).toISOString(),
        litre: cislo(x.volume) ?? 0,
        suma: cislo(x.cost),
        mena: prazdne(x.currencyCode),
        palivo: x.productType && x.productType !== "Unknown" ? x.productType : null,
        miesto: prazdne(x.siteName),
        tachometerKm: odo && odo > 0 ? odo : null,
        surove: x,
      };
    });
}

export const adapter: GpsAdapter = {
  id: "geotab",
  nazov: "Geotab",
  web: "https://www.geotab.com",
  dokumentacia: "https://developers.geotab.com/myGeotab/guides/concepts/",
  polia: [
    {
      kluc: "server",
      nazov: "Server",
      typ: "text",
      povinne: false,
      pomoc:
        "Predvolene my.geotab.com; ak sa prihlasujete inam (napr. my123.geotab.com), zadajte ten.",
    },
    { kluc: "database", nazov: "Databáza", typ: "text", povinne: true },
    { kluc: "user", nazov: "Používateľ (e-mail)", typ: "text", povinne: true },
    { kluc: "password", nazov: "Heslo", typ: "heslo", povinne: true },
  ],

  async test(p) {
    const rel = await prihlas(p);
    await zavolaj(rel.server, "Get", {
      typeName: "Device",
      resultsLimit: 1,
      credentials: rel.credentials,
    });
  },

  async vozidla(p) {
    const rel = await prihlas(p);
    const zariadenia = await get<GeotabDevice>(rel, "Device");
    return zariadenia.map((d): GpsVozidlo => ({
      externeId: d.id,
      spz: prazdne(d.licensePlate),
      nazov: prazdne(d.name),
      vin: prazdne(d.vehicleIdentificationNumber),
    }));
  },

  async jazdy(p, od, do_, vozidla) {
    const rel = await prihlas(p);
    const okno = { fromDate: od.toISOString(), toDate: do_.toISOString() };
    const trips: GeotabTrip[] = [];
    if (vozidla?.length) {
      for (const id of vozidla) {
        trips.push(...(await get<GeotabTrip>(rel, "Trip", { ...okno, deviceSearch: { id } })));
      }
    } else {
      trips.push(...(await get<GeotabTrip>(rel, "Trip", okno)));
    }
    const vodici = new Map<string, string>();
    if (trips.some((t) => idOdkazu(t.driver) && idOdkazu(t.driver) !== "UnknownDriverId")) {
      const users = await get<GeotabUser>(rel, "User", { isDriver: true });
      for (const u of users) {
        const m = menoVodica(u);
        if (m) vodici.set(u.id, m);
      }
    }
    return prevedJazdy(trips, vodici);
  },

  async tankovania(p, od, do_) {
    const rel = await prihlas(p);
    const f = await get<GeotabFuel>(rel, "FuelTransaction", {
      fromDate: od.toISOString(),
      toDate: do_.toISOString(),
    });
    return prevedTankovania(f);
  },
};
