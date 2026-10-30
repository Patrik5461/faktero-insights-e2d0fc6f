/**
 * Supabase Management API pre Admin → Využitie zdrojov.
 *
 * SUPABASE_ACCESS_TOKEN a SUPABASE_PROJECT_REF sú serverové tajomstvá: ostávajú
 * v tomto súbore, do odpovede ide len to, čo API vráti o projekte (nikdy token
 * ani ref). Čo API neposkytuje alebo zlyhá, vráti `dostupne: false` s dôvodom —
 * hodnoty sa nedopočítavajú ani neodhadujú.
 *
 * Endpointy podľa https://api.supabase.com/api/v1-json (overené 2026-10-29).
 */

const API = "https://api.supabase.com";
const TIMEOUT_MS = 8000;

export type Hodnota<T> = { dostupne: true; hodnota: T } | { dostupne: false; dovod: string };

export type DiskInfo = {
  typ: string | null;
  velkost_gb: number | null;
  iops: number | null;
  throughput_mibps: number | null;
};

export type DiskVyuzitie = { velkost_bajty: number; pouzite_bajty: number; volne_bajty: number };

export type DiskAutoscale = {
  rast_percent: number | null;
  min_prirastok_gb: number | null;
  max_velkost_gb: number | null;
};

export type ManagementUdaje = {
  token: boolean;
  disk: Hodnota<DiskInfo>;
  diskVyuzitie: Hodnota<DiskVyuzitie>;
  diskAutoscale: Hodnota<DiskAutoscale>;
  compute: Hodnota<string>;
  edgeFunkcie: Hodnota<number>;
  poziadavky7d: Hodnota<{ auth: number; realtime: number; rest: number; storage: number }>;
};

const CHYBA_TOKEN = "chýba prístupový token";

function nedostupne(dovod: string): { dostupne: false; dovod: string } {
  return { dostupne: false, dovod };
}

/** Ref projektu: tajomstvo SUPABASE_PROJECT_REF, inak z adresy SUPABASE_URL. */
function refProjektu(): string | null {
  const ref = process.env.SUPABASE_PROJECT_REF?.trim();
  if (ref) return ref;
  const url = process.env.SUPABASE_URL;
  const m = url ? /^https:\/\/([a-z0-9]{20})\.supabase\.co/.exec(url) : null;
  return m ? m[1] : null;
}

async function volaj(token: string, cesta: string): Promise<Hodnota<any>> {
  try {
    const res = await fetch(`${API}${cesta}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // Telo chyby sa nevracia — mohlo by obsahovať údaje o účte.
      return nedostupne(`API vrátilo ${res.status}`);
    }
    return { dostupne: true, hodnota: await res.json() };
  } catch (e: any) {
    return nedostupne(e?.name === "TimeoutError" ? "API neodpovedalo včas" : "API nedostupné");
  }
}

function mapuj<T>(h: Hodnota<any>, f: (v: any) => T | null): Hodnota<T> {
  if (!h.dostupne) return h;
  try {
    const v = f(h.hodnota);
    return v == null ? nedostupne("API nevrátilo údaj") : { dostupne: true, hodnota: v };
  } catch {
    return nedostupne("neočakávaný tvar odpovede");
  }
}

const cislo = (x: unknown): number | null => {
  const n = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
};

export async function nacitajManagementUdaje(): Promise<ManagementUdaje> {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const ref = refProjektu();
  if (!token || !ref) {
    const n = nedostupne(token ? "chýba ref projektu" : CHYBA_TOKEN);
    return {
      token: false,
      disk: n,
      diskVyuzitie: n,
      diskAutoscale: n,
      compute: n,
      edgeFunkcie: n,
      poziadavky7d: n,
    };
  }
  const p = `/v1/projects/${encodeURIComponent(ref)}`;
  // Logy sa tu nedotazujú: API logov má prísny limit rýchlosti a stránka by ho
  // míňala pri každom načítaní. Denné súčty z logov ťahá cron do admin_usage_daily
  // (zdroje-logy.server.ts).
  const [disk, util, autoscale, addons, funkcie, poziadavky] = await Promise.all([
    volaj(token, `${p}/config/disk`),
    volaj(token, `${p}/config/disk/util`),
    volaj(token, `${p}/config/disk/autoscale`),
    volaj(token, `${p}/billing/addons`),
    volaj(token, `${p}/functions`),
    volaj(token, `${p}/analytics/endpoints/usage.api-counts?interval=7day`),
  ]);

  return {
    token: true,
    disk: mapuj(disk, (v) => {
      const a = v?.attributes ?? {};
      return {
        typ: typeof a.type === "string" ? a.type : null,
        velkost_gb: cislo(a.size_gb),
        iops: cislo(a.iops),
        throughput_mibps: cislo(a.throughput_mibps),
      };
    }),
    diskVyuzitie: mapuj(util, (v) => {
      const m = v?.metrics;
      const velkost = cislo(m?.fs_size_bytes);
      const pouzite = cislo(m?.fs_used_bytes);
      if (velkost == null || pouzite == null) return null;
      return {
        velkost_bajty: velkost,
        pouzite_bajty: pouzite,
        volne_bajty: cislo(m?.fs_avail_bytes) ?? velkost - pouzite,
      };
    }),
    diskAutoscale: mapuj(autoscale, (v) => ({
      rast_percent: cislo(v?.growth_percent),
      min_prirastok_gb: cislo(v?.min_increment_gb),
      max_velkost_gb: cislo(v?.max_size_gb),
    })),
    compute: mapuj(addons, (v) => {
      const c = (v?.selected_addons ?? []).find((a: any) => a?.type === "compute_instance");
      return typeof c?.variant?.name === "string" ? c.variant.name : null;
    }),
    edgeFunkcie: mapuj(funkcie, (v) => (Array.isArray(v) ? v.length : null)),
    poziadavky7d: mapuj(poziadavky, (v) => {
      if (v?.error || !Array.isArray(v?.result)) return null;
      const s = { auth: 0, realtime: 0, rest: 0, storage: 0 };
      for (const r of v.result) {
        s.auth += cislo(r?.total_auth_requests) ?? 0;
        s.realtime += cislo(r?.total_realtime_requests) ?? 0;
        s.rest += cislo(r?.total_rest_requests) ?? 0;
        s.storage += cislo(r?.total_storage_requests) ?? 0;
      }
      return s;
    }),
  };
}
