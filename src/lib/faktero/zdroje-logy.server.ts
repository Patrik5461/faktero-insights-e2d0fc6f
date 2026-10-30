/**
 * Denné odhady využitia z logov Supabase → `admin_usage_daily`.
 *
 * Volá ho hook /api/public/hooks/zdroje-logy (pg_cron v noci, niekoľkokrát).
 * Jedno volanie stiahne najviac jeden deň: Management API má na logy prísny
 * limit (429 už po 2–3 dotazoch) a nginx reže spojenie po 30 s. Chýbajúce dni
 * (aj spätne do retencie logov) doplnia ďalšie behy.
 *
 * SUPABASE_ACCESS_TOKEN ostáva na serveri, do odpovede ani logu nejde.
 */
import { SQL_DEN, chybajuceDni, hraniceDna, spracujOdpovedLogov } from "./zdroje-logy";

const API = "https://api.supabase.com";
const TIMEOUT_MS = 20000;

function refProjektu(): string | null {
  const ref = process.env.SUPABASE_PROJECT_REF?.trim();
  if (ref) return ref;
  const url = process.env.SUPABASE_URL;
  const m = url ? /^https:\/\/([a-z0-9]{20})\.supabase\.co/.exec(url) : null;
  return m ? m[1] : null;
}

export class LimitLogov extends Error {}

/** Stiahne a spočíta jeden deň (UTC). Pri 429 hodí `LimitLogov`. */
export async function stiahniDenZLogov(den: string) {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const ref = refProjektu();
  if (!token) throw new Error("chýba prístupový token");
  if (!ref) throw new Error("chýba ref projektu");
  const { start, end } = hraniceDna(den);
  const u = new URL(`${API}/v1/projects/${encodeURIComponent(ref)}/analytics/endpoints/logs`);
  u.searchParams.set("sql", SQL_DEN);
  u.searchParams.set("iso_timestamp_start", start);
  u.searchParams.set("iso_timestamp_end", end);
  const res = await fetch(u, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 429) throw new LimitLogov("API logov vrátilo 429");
  // Telo chyby sa nevracia — mohlo by obsahovať údaje o účte.
  if (!res.ok) throw new Error(`API logov vrátilo ${res.status}`);
  return spracujOdpovedLogov(await res.json());
}

export type VysledokBehu =
  | { ok: true; den: string | null; chybajuce: string[]; ulozene?: Record<string, number> }
  | { ok: false; den: string; chybajuce: string[]; dovod: string };

/** Doplní najnovší chýbajúci deň. `den` vynúti konkrétny deň (prepíše ho). */
export async function doplnDenVyuzitia(vynutenyDen?: string): Promise<VysledokBehu> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const teraz = new Date();
  const { data, error } = await (supabaseAdmin as any)
    .from("admin_usage_daily")
    .select("date")
    .gte("date", new Date(teraz.getTime() - 10 * 86400000).toISOString().slice(0, 10));
  if (error) throw new Error(`admin_usage_daily: ${error.message}`);
  const chybajuce = chybajuceDni(
    teraz,
    ((data ?? []) as { date: string }[]).map((r) => r.date),
  );
  const den = vynutenyDen ?? chybajuce[0];
  if (!den) return { ok: true, den: null, chybajuce };

  let vysledok;
  try {
    vysledok = await stiahniDenZLogov(den);
  } catch (e: any) {
    const dovod = e?.name === "TimeoutError" ? "API logov neodpovedalo včas" : String(e?.message);
    return { ok: false, den, chybajuce, dovod };
  }
  const riadok = {
    date: den,
    egress_bytes: vysledok.egress_bytes,
    egress_measured_bytes: vysledok.egress_measured_bytes,
    responses_total: vysledok.responses_total,
    responses_without_length: vysledok.responses_without_length,
    realtime_messages: vysledok.realtime_messages,
    edge_invocations: vysledok.edge_invocations,
    detail: vysledok.detail,
    updated_at: new Date().toISOString(),
  };
  const { error: chyba } = await (supabaseAdmin as any)
    .from("admin_usage_daily")
    .upsert(riadok, { onConflict: "date" });
  if (chyba) throw new Error(`admin_usage_daily: ${chyba.message}`);
  return {
    ok: true,
    den,
    chybajuce: chybajuce.filter((d) => d !== den),
    ulozene: {
      egress_bytes: riadok.egress_bytes,
      realtime_messages: riadok.realtime_messages,
      edge_invocations: riadok.edge_invocations,
    },
  };
}
