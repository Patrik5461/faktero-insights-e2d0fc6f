/**
 * GPS Dozor (TLV s.r.o., CZ/SK) — JSON API v1.
 *
 * Dokumentácia: https://www.gpsdozor.cz/documentation/api
 * Base: https://a1.gpsguard.eu/api/v1/ — Basic auth tými istými údajmi ako
 * prihlásenie do systému GPS Dozor.
 *
 * Overené 30. 10. 2026 proti verejnému DEMO účtu (len čítanie):
 * - `/groups` → `[{Code, Name}]`, `/vehicles/group/{Code}` → vozidlá (`Code`, `SPZ`, `Name`, `Odometer` v km).
 * - `/vehicle/{Code}/trips?from=…&to=…` vracia aj `Id` jazdy (v dokumentácii chýba), `IsFinished`,
 *   `Odometer` = stav tachometra na konci jazdy v km. Časy jazdy sú bez zóny, ale sú v UTC
 *   (koniec poslednej jazdy = `LastPositionTimestamp` so „Z“).
 * - Interval dlhší ako 30 dní → 400 „Timespan error.“, `to` < `from` → 400 „Interval error.“
 * - Zlé heslo → 401, neznáme vozidlo → 404.
 *
 * Čo API nevie:
 * - tankovania: API dáva len zoznam tankovacích kariet vozidla, nie transakcie → `tankovania` chýba.
 * - označenie jednej jazdy ako súkromnej: `POST /trip-purposes` nastaví účel celému vozidlu
 *   od tejto chvíle ďalej (platí pre všetky ďalšie jazdy), nie konkrétnej jazde → `oznacSukromnu` chýba.
 *   Zápis by tak prepísal účel aj budúcim jazdám, čo používateľ nečaká.
 */
import { GpsChyba, type GpsAdapter, type GpsJazda, type GpsVozidlo } from "./typy";

export const ZAKLAD = "https://a1.gpsguard.eu/api/v1/";
/** API odmietne interval nad 30 dní; berieme s rezervou. */
const MAX_OKNO_MS = 29 * 24 * 3600 * 1000;

type Prihlasenie = Record<string, string>;

function hlavicky(p: Prihlasenie): Record<string, string> {
  const meno = (p.login ?? "").trim();
  const heslo = p.heslo ?? "";
  if (!meno || !heslo) throw new GpsChyba("prihlasenie", "Chýba prihlasovacie meno alebo heslo.");
  return {
    Authorization: "Basic " + Buffer.from(`${meno}:${heslo}`, "utf8").toString("base64"),
    Accept: "application/json",
  };
}

async function volaj<T>(p: Prihlasenie, cesta: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ZAKLAD + cesta, {
      ...init,
      headers: { ...hlavicky(p), ...(init?.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    if (e instanceof GpsChyba) throw e;
    throw new GpsChyba("siet", "GPS Dozor neodpovedá. Skúste to o chvíľu.");
  }
  if (res.status === 401 || res.status === 403)
    throw new GpsChyba("prihlasenie", "GPS Dozor odmietol prihlasovacie meno alebo heslo.");
  if (res.status === 429)
    throw new GpsChyba("limit", "GPS Dozor dočasne obmedzil počet volaní. Skúste to neskôr.");
  if (!res.ok) {
    let sprava = "";
    try {
      const telo = (await res.json()) as { Message?: string };
      // „10/30/2026 11:07:51 PM - Timespan error.“ → len text za pomlčkou
      sprava = String(telo?.Message ?? "")
        .replace(/^.*? - /, "")
        .slice(0, 200);
    } catch {
      // telo nie je JSON
    }
    if (res.status === 404)
      throw new GpsChyba("api", "GPS Dozor vozidlo nenašiel (mohlo byť odobraté z účtu).");
    throw new GpsChyba(
      "api",
      `GPS Dozor vrátil chybu ${res.status}${sprava ? `: ${sprava}` : ""}.`,
    );
  }
  return (await res.json()) as T;
}

/** Formát parametra `from`/`to`: `2018-05-20T00:00` v UTC. */
export function formatCasu(d: Date): string {
  return d.toISOString().slice(0, 16);
}

/** Čas bez zóny je v UTC (overené na DEMO účte). */
export function naIso(cas: string | null | undefined): string | null {
  if (!cas) return null;
  const s = String(cas).trim();
  const sZonou = /(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : s + "Z";
  const d = new Date(sZonou);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/** Rozdelí obdobie na okná, ktoré API prijme (najviac 29 dní). */
export function oknaObdobia(od: Date, do_: Date): Array<[Date, Date]> {
  const okna: Array<[Date, Date]> = [];
  let z = od.getTime();
  const k = do_.getTime();
  while (z < k) {
    const koniec = Math.min(k, z + MAX_OKNO_MS);
    okna.push([new Date(z), new Date(koniec)]);
    z = koniec;
  }
  return okna;
}

function cislo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** „Doe, John“ → „John Doe“. */
export function menoVodica(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  const m = s.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : s;
}

const GALON: Record<number, number> = { 0: 1, 1: 3.785411784, 2: 4.54609 };

export type DozorJazda = {
  Id?: number | string;
  TripType?: boolean;
  StartTime?: string;
  FinishTime?: string;
  StartPosition?: { Latitude?: string | number; Longitude?: string | number };
  FinishPosition?: { Latitude?: string | number; Longitude?: string | number };
  StartAddress?: string;
  FinishAddress?: string;
  TotalDistance?: number;
  Purpose?: string;
  DriverName?: string;
  Driver2Name?: string;
  IsFinished?: boolean;
  Odometer?: number;
  FuelConsumed?: { Value?: number; VolumeUnit?: number };
};

export function mapujJazdu(vozidlo: string, r: DozorJazda): GpsJazda | null {
  const zaciatok = naIso(r.StartTime);
  const koniec = naIso(r.FinishTime);
  if (!zaciatok || !koniec) return null;
  // Rozbehnutá jazda sa ešte zmení — vezme ju až ďalší beh.
  if (r.IsFinished === false) return null;
  const km = Math.round((cislo(r.TotalDistance) ?? 0) * 1000) / 1000;
  const tachoKoniec = cislo(r.Odometer);
  const palivo = r.FuelConsumed;
  const litre =
    palivo && cislo(palivo.Value) != null
      ? (cislo(palivo.Value) as number) * (GALON[palivo.VolumeUnit ?? 0] ?? 1)
      : null;
  const ucel = (r.Purpose ?? "").trim() || null;
  return {
    externeId: r.Id != null ? String(r.Id) : `${vozidlo}:${r.StartTime}`,
    vozidloExterneId: vozidlo,
    zaciatok,
    koniec,
    odAdresa: (r.StartAddress ?? "").trim() || null,
    doAdresa: (r.FinishAddress ?? "").trim() || null,
    odLat: cislo(r.StartPosition?.Latitude),
    odLng: cislo(r.StartPosition?.Longitude),
    doLat: cislo(r.FinishPosition?.Latitude),
    doLng: cislo(r.FinishPosition?.Longitude),
    km,
    tachometerKoniec: tachoKoniec,
    tachometerZaciatok: tachoKoniec != null ? Math.max(0, Math.round(tachoKoniec - km)) : null,
    vodic: menoVodica(r.DriverName),
    // TripType: false = služobná (všetky jazdy DEMO účtu), true = súkromná.
    sukromna: typeof r.TripType === "boolean" ? r.TripType : null,
    ucel,
    spotrebaL: litre != null ? Math.round(litre * 100) / 100 : null,
    surove: r,
  };
}

type DozorSkupina = { Code: string; Name?: string };
type DozorVozidlo = { Code: string; Name?: string; SPZ?: string; Odometer?: number };

export const adapter: GpsAdapter = {
  id: "gpsdozor",
  nazov: "GPS Dozor",
  web: "https://www.gpsdozor.cz",
  dokumentacia: "https://www.gpsdozor.cz/documentation/api",
  polia: [
    {
      kluc: "login",
      nazov: "Prihlasovacie meno",
      typ: "text",
      povinne: true,
      pomoc: "To isté meno, ktorým sa prihlasujete do GPS Dozor.",
    },
    { kluc: "heslo", nazov: "Heslo", typ: "heslo", povinne: true },
  ],

  async test(p) {
    const skupiny = await volaj<DozorSkupina[]>(p, "groups");
    if (!Array.isArray(skupiny) || !skupiny.length)
      throw new GpsChyba("api", "Účet GPS Dozor nemá prístup k žiadnej skupine vozidiel.");
  },

  async vozidla(p) {
    const skupiny = await volaj<DozorSkupina[]>(p, "groups");
    const vysledok: GpsVozidlo[] = [];
    const videne = new Set<string>();
    for (const s of skupiny ?? []) {
      if (!s?.Code) continue;
      const auta = await volaj<DozorVozidlo[]>(p, `vehicles/group/${encodeURIComponent(s.Code)}`);
      for (const a of auta ?? []) {
        if (!a?.Code || videne.has(a.Code)) continue;
        videne.add(a.Code);
        vysledok.push({
          externeId: a.Code,
          spz: (a.SPZ ?? "").trim() || null,
          nazov: (a.Name ?? "").trim() || null,
          tachometerKm: cislo(a.Odometer),
        });
      }
    }
    return vysledok;
  },

  async jazdy(p, od, do_, vozidla) {
    const kody = vozidla?.length ? vozidla : (await this.vozidla(p)).map((v) => v.externeId);
    const jazdy: GpsJazda[] = [];
    // Jazda na hranici dvoch okien príde dvakrát.
    const videne = new Set<string>();
    for (const kod of kody) {
      for (const [z, k] of oknaObdobia(od, do_)) {
        const riadky = await volaj<DozorJazda[]>(
          p,
          `vehicle/${encodeURIComponent(kod)}/trips?from=${formatCasu(z)}&to=${formatCasu(k)}`,
        );
        for (const r of riadky ?? []) {
          const j = mapujJazdu(kod, r);
          if (j && !videne.has(j.externeId)) {
            videne.add(j.externeId);
            jazdy.push(j);
          }
        }
      }
    }
    return jazdy;
  },
};
