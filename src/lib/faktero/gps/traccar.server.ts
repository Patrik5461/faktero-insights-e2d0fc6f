/**
 * Traccar — adaptér GPS (open source server, hostovaný Traccarom alebo vlastný server zákazníka).
 *
 * Dokumentácia: https://www.traccar.org/traccar-api/
 * OpenAPI: https://www.traccar.org/api-reference/openapi.yaml
 *
 * Ako API funguje (podľa OpenAPI):
 * - adresa servera + `/api/…`; prihlásenie HTTP Basic (e-mail + heslo) alebo Bearer token
 *   (`securitySchemes: BasicAuth, ApiKey`). Token si používateľ vytvorí v Traccari
 *   v Nastavenia → Účet → Token (`POST /api/session/token`).
 * - vozidlá: `GET /api/devices` → pole `Device` (`id`, `name`, `uniqueId`, `disabled`,
 *   `attributes`…). ŠPZ Traccar ako pole nemá; berieme ju z atribútu, inak z názvu,
 *   ak názov ako ŠPZ vyzerá.
 * - jazdy: `GET /api/reports/trips?deviceId=…&from=…&to=…` (ISO 8601, aspoň jedno
 *   `deviceId` alebo `groupId` povinné) → pole `ReportTrips`: `distance` v metroch,
 *   rýchlosti v uzloch, `spentFuel` v litroch, `startLat/startLon` v stupňoch.
 *   Server Traccaru navyše posiela `startPositionId`, `endPositionId`, `startOdometer`
 *   a `endOdometer` (metre) — v OpenAPI chýbajú, preto sú voliteľné.
 *
 * Čo API nevie:
 * - súkromná jazda: Traccar ju nerozlišuje. Pole `business` v `ReportTrips` je atribút
 *   štartovej polohy a bez neho je vždy `false`, takže „súkromná“ sa z neho spoľahlivo
 *   určiť nedá → `sukromna: null`. Zápis späť (`oznacSukromnu`) preto chýba.
 * - tankovania: Traccar nemá zoznam tankovaní, len spotrebu `spentFuel` za jazdu
 *   (dávame ju do `spotrebaL`). Metóda `tankovania` chýba zámerne.
 *
 * Bezpečnosť: adresu servera zadáva zákazník a náš server na ňu volá. Preto ako pri
 * webhookoch (webhook-adresa.server.ts) musí byť https, bez mena a hesla v adrese
 * a na verejnej IP; presmerovania sa nenasledujú (mohli by viesť do vnútornej siete).
 */
import { overVerejnyServer } from "../odoslanie-mailu.server";
import { GpsChyba, type GpsAdapter, type GpsJazda, type GpsVozidlo } from "./typy";

/** Koľko zariadení ide v jednej požiadavke na jazdy (dĺžka URL). */
const ZARIADENI_NA_DOTAZ = 25;
/** Okno reportu — Traccar môže mať na serveri strop obdobia (`report.periodLimit`). */
const OKNO_DNI = 31;

type TraccarZariadenie = {
  id: number;
  name?: string;
  uniqueId?: string;
  disabled?: boolean;
  model?: string | null;
  attributes?: Record<string, unknown> | null;
};

type TraccarJazda = {
  deviceId: number;
  deviceName?: string;
  business?: boolean;
  distance?: number;
  spentFuel?: number;
  duration?: number;
  startTime: string;
  endTime: string;
  startAddress?: string | null;
  endAddress?: string | null;
  startLat?: number;
  startLon?: number;
  endLat?: number;
  endLon?: number;
  driverUniqueId?: string | null;
  driverName?: string | null;
  // mimo OpenAPI, ale server ich posiela
  startPositionId?: number;
  endPositionId?: number;
  startOdometer?: number;
  endOdometer?: number;
};

// ---------------------------------------------------------------------------
// Adresa servera
// ---------------------------------------------------------------------------

/**
 * Overí adresu servera a vráti základ API (bez koncového „/“, s „/api“).
 * Prijme `https://gps.firma.sk`, `https://gps.firma.sk/`, `https://x.sk/traccar/api`.
 */
export async function overAdresuServera(adresa: string): Promise<string> {
  let u: URL;
  try {
    u = new URL((adresa ?? "").trim());
  } catch {
    throw new GpsChyba(
      "prihlasenie",
      "Adresa servera Traccar nie je platná (napr. https://gps.firma.sk).",
    );
  }
  if (u.protocol !== "https:")
    throw new GpsChyba("prihlasenie", "Server Traccar musí byť na https:// adrese.");
  if (u.username || u.password)
    throw new GpsChyba("prihlasenie", "Adresa servera nesmie obsahovať meno a heslo.");
  if (u.search || u.hash)
    throw new GpsChyba("prihlasenie", "Zadajte len adresu servera, bez parametrov.");
  try {
    await overVerejnyServer(u.hostname.replace(/^\[|\]$/g, ""));
  } catch {
    throw new GpsChyba(
      "prihlasenie",
      `Server ${u.hostname} nie je verejne dostupná adresa — zadajte adresu, na ktorú sa dá pripojiť z internetu.`,
    );
  }
  const cesta = u.pathname.replace(/\/+$/, "").replace(/\/api$/, "");
  return `${u.origin}${cesta}/api`;
}

function hlavickaPrihlasenia(p: Record<string, string>): string {
  const token = (p.token ?? "").trim();
  if (token) return `Bearer ${token}`;
  const email = (p.email ?? "").trim();
  const heslo = p.heslo ?? "";
  if (!email || !heslo)
    throw new GpsChyba("prihlasenie", "Vyplňte e-mail a heslo do Traccaru, alebo token.");
  return `Basic ${Buffer.from(`${email}:${heslo}`, "utf8").toString("base64")}`;
}

async function volaj<T>(p: Record<string, string>, cesta: string, q?: URLSearchParams): Promise<T> {
  const zaklad = await overAdresuServera(p.url);
  const auth = hlavickaPrihlasenia(p);
  let res: Response;
  try {
    res = await fetch(`${zaklad}${cesta}${q ? `?${q.toString()}` : ""}`, {
      headers: { accept: "application/json", authorization: auth },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GpsChyba("siet", "Server Traccar neodpovedá. Skontrolujte adresu servera.");
  }
  if (res.status >= 300 && res.status < 400)
    throw new GpsChyba(
      "prihlasenie",
      "Server Traccar presmerúva na inú adresu — zadajte priamo adresu, na ktorej Traccar beží.",
    );
  if (res.status === 401 || res.status === 403)
    throw new GpsChyba(
      "prihlasenie",
      "Traccar neprijal prihlásenie — skontrolujte e-mail a heslo alebo token.",
    );
  if (res.status === 429)
    throw new GpsChyba("limit", "Server Traccar hlási priveľa požiadaviek. Skúste to neskôr.");
  if (res.status === 404)
    throw new GpsChyba("api", "Na tejto adrese Traccar API nie je — skontrolujte adresu servera.");
  const telo = await res.text();
  if (!res.ok) {
    // Traccar posiela pri chybe text výnimky (napr. „Report period limit exceeded“).
    const popis = telo.replace(/\s+/g, " ").trim().slice(0, 200);
    throw new GpsChyba("api", `Traccar vrátil chybu ${res.status}${popis ? `: ${popis}` : ""}.`);
  }
  try {
    return JSON.parse(telo) as T;
  } catch {
    throw new GpsChyba("api", "Server neodpovedá ako Traccar — skontrolujte adresu servera.");
  }
}

// ---------------------------------------------------------------------------
// Prevody
// ---------------------------------------------------------------------------

function text(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function cislo(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Vyzerá text ako ŠPZ (SK „BA123AB“, „BA-123AB“, CZ „1AB 2345“)? */
export function vyzeraAkoSpz(s: string | null): boolean {
  if (!s) return false;
  const t = s.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(t) || /^\d[A-Z][A-Z0-9]\d{4}$/.test(t);
}

export function naVozidlo(d: TraccarZariadenie): GpsVozidlo {
  const a = d.attributes ?? {};
  const zAtributu =
    text(a.licensePlate) ?? text(a.plate) ?? text(a.registration) ?? text(a.spz) ?? null;
  const nazov = text(d.name);
  return {
    externeId: String(d.id),
    spz: zAtributu ?? (vyzeraAkoSpz(nazov) ? nazov : null),
    nazov,
    vin: text(a.vin),
    tachometerKm: null,
  };
}

const kmZMetrov = (m: number | null) => (m == null ? null : Math.round((m / 1000) * 10) / 10);

export function naJazdu(j: TraccarJazda): GpsJazda | null {
  if (j.deviceId == null || !j.startTime || !j.endTime) return null;
  const z = new Date(j.startTime);
  const k = new Date(j.endTime);
  if (Number.isNaN(z.getTime()) || Number.isNaN(k.getTime())) return null;
  // Stabilné id: štartová poloha je v databáze Traccaru jedinečná; bez nej čas štartu.
  const externeId =
    j.startPositionId != null
      ? `${j.deviceId}:${j.startPositionId}`
      : `${j.deviceId}:${z.toISOString()}`;
  return {
    externeId,
    vozidloExterneId: String(j.deviceId),
    zaciatok: z.toISOString(),
    koniec: k.toISOString(),
    odAdresa: text(j.startAddress),
    doAdresa: text(j.endAddress),
    odLat: cislo(j.startLat),
    odLng: cislo(j.startLon),
    doLat: cislo(j.endLat),
    doLng: cislo(j.endLon),
    km: Math.round(((cislo(j.distance) ?? 0) / 1000) * 100) / 100,
    tachometerZaciatok: kmZMetrov(cislo(j.startOdometer)),
    tachometerKoniec: kmZMetrov(cislo(j.endOdometer)),
    vodic: text(j.driverName) ?? text(j.driverUniqueId),
    sukromna: null,
    ucel: null,
    spotrebaL: cislo(j.spentFuel) || null,
    surove: j,
  };
}

export function oknaObdobia(od: Date, do_: Date, dni = OKNO_DNI): [Date, Date][] {
  const okna: [Date, Date][] = [];
  const krok = dni * 86_400_000;
  for (let z = od.getTime(); z < do_.getTime(); z += krok)
    okna.push([new Date(z), new Date(Math.min(z + krok, do_.getTime()))]);
  return okna;
}

// ---------------------------------------------------------------------------
// Adaptér
// ---------------------------------------------------------------------------

async function zariadenia(p: Record<string, string>) {
  const d = await volaj<TraccarZariadenie[]>(p, "/devices");
  if (!Array.isArray(d))
    throw new GpsChyba("api", "Server neodpovedá ako Traccar — skontrolujte adresu servera.");
  return d;
}

export const adapter: GpsAdapter = {
  id: "traccar",
  nazov: "Traccar",
  web: "https://www.traccar.org",
  dokumentacia: "https://www.traccar.org/traccar-api/",
  polia: [
    {
      kluc: "url",
      nazov: "Adresa servera",
      typ: "url",
      povinne: true,
      pomoc: "Napr. https://demo.traccar.org alebo adresa vášho vlastného servera (len https).",
    },
    { kluc: "email", nazov: "E-mail", typ: "text", povinne: false },
    { kluc: "heslo", nazov: "Heslo", typ: "heslo", povinne: false },
    {
      kluc: "token",
      nazov: "Token",
      typ: "heslo",
      povinne: false,
      pomoc: "Namiesto e-mailu a hesla. V Traccari: Nastavenia → Účet → Token.",
    },
  ],

  async test(p) {
    await zariadenia(p);
  },

  async vozidla(p) {
    return (await zariadenia(p)).filter((d) => !d.disabled).map(naVozidlo);
  },

  async jazdy(p, od, do_, vozidla) {
    const idcka = vozidla?.length
      ? vozidla.filter((v) => /^\d+$/.test(v))
      : (await zariadenia(p)).filter((d) => !d.disabled).map((d) => String(d.id));
    const vysledok = new Map<string, GpsJazda>();
    for (const [z, k] of oknaObdobia(od, do_)) {
      for (let i = 0; i < idcka.length; i += ZARIADENI_NA_DOTAZ) {
        const q = new URLSearchParams();
        for (const id of idcka.slice(i, i + ZARIADENI_NA_DOTAZ)) q.append("deviceId", id);
        q.set("from", z.toISOString());
        q.set("to", k.toISOString());
        const riadky = await volaj<TraccarJazda[]>(p, "/reports/trips", q);
        if (!Array.isArray(riadky))
          throw new GpsChyba("api", "Traccar vrátil odpoveď, ktorej nerozumieme.");
        for (const r of riadky) {
          const j = naJazdu(r);
          if (j) vysledok.set(j.externeId, j); // jazda cez hranicu okien príde dvakrát
        }
      }
    }
    return [...vysledok.values()];
  },
};
