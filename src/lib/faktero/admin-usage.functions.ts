import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin → Využitie zdrojov (plán Supabase Pro).
 * SQL časť: public.admin_zdroje_prehlad() (len service_role), limity v admin_plan_limits.
 * Management API: admin-zdroje-api.server.ts (token ostáva na serveri).
 * Výsledok sa drží 10 minút; „Obnoviť“ pošle obnovit=true.
 */

const CACHE_MS = 10 * 60 * 1000;

const ROW_COUNT_TABLES = [
  "invoices",
  "companies",
  "profiles",
  "invoice_items",
  "stock_movements",
] as const;

async function assertAdmin(context: { userId: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_admins")
    .select("role")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error || !data) throw new Error("Forbidden: not a platform admin");
  return { supabaseAdmin };
}

type Prehlad = Awaited<ReturnType<typeof nacitajPrehlad>>;
let cache: { data: Prehlad; cas: number } | null = null;

async function nacitajPrehlad(supabaseAdmin: any) {
  const { nacitajManagementUdaje } = await import("./admin-zdroje-api.server");
  const { jeDocasnyKos } = await import("./admin-zdroje");

  const [sqlVysledok, api, rowCounts] = await Promise.all([
    supabaseAdmin.rpc("admin_zdroje_prehlad"),
    nacitajManagementUdaje(),
    (async () => {
      const out: Record<string, number> = {};
      await Promise.all(
        ROW_COUNT_TABLES.map(async (t) => {
          const { count } = await supabaseAdmin.from(t).select("*", { count: "exact", head: true });
          out[t] = count ?? 0;
        }),
      );
      return out;
    })().catch(() => ({}) as Record<string, number>),
  ]);

  if (sqlVysledok.error) {
    console.error("[admin-zdroje] admin_zdroje_prehlad:", sqlVysledok.error.message);
    throw new Error("Prehľad zdrojov sa nepodarilo načítať");
  }
  const p = (sqlVysledok.data ?? {}) as any;

  const buckets = ((p.buckets ?? []) as any[]).map((b) => {
    const files = Number(b.files ?? 0);
    const size = Number(b.size_bytes ?? 0);
    return {
      name: String(b.name),
      files,
      size_bytes: size,
      priemer_bajty: files > 0 ? size / files : 0,
      docasny: jeDocasnyKos(String(b.name)),
    };
  });

  return {
    db: {
      size_bytes: Number(p.db_size_bytes ?? 0),
      tables: ((p.tables ?? []) as any[]).map((t) => ({
        schema: String(t.schema),
        table: String(t.table),
        size_bytes: Number(t.size_bytes ?? 0),
      })),
    },
    storage: {
      used_bytes: buckets.reduce((s, b) => s + b.size_bytes, 0),
      files: buckets.reduce((s, b) => s + b.files, 0),
      buckets,
    },
    auth: {
      users_total: Number(p.auth?.users_total ?? 0),
      mau: Number(p.auth?.mau ?? 0),
      month_start: String(p.auth?.month_start ?? ""),
    },
    limits: ((p.limits ?? []) as any[]).map((l) => ({
      kluc: String(l.kluc),
      plan: String(l.plan),
      nazov: String(l.nazov),
      jednotka: l.jednotka === "bajty" ? ("bajty" as const) : ("pocet" as const),
      zahrnute: Number(l.zahrnute),
      cena_usd: l.cena_usd == null ? null : Number(l.cena_usd),
      za_mnozstvo: Number(l.za_mnozstvo ?? 1),
      poznamka: l.poznamka == null ? null : String(l.poznamka),
      zdroj: String(l.zdroj),
      overene: String(l.overene),
    })),
    usd_kurz: p.usd_kurz ? { den: String(p.usd_kurz.den), kurz: Number(p.usd_kurz.kurz) } : null,
    api,
    row_counts: rowCounts,
    generated_at: new Date().toISOString(),
  };
}

export const getSupabaseUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ({ obnovit: !!(d as { obnovit?: unknown } | undefined)?.obnovit }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await assertAdmin(context);
    if (!data.obnovit && cache && Date.now() - cache.cas < CACHE_MS) {
      return { ...cache.data, z_cache: true };
    }
    const vysledok = await nacitajPrehlad(supabaseAdmin);
    cache = { data: vysledok, cas: Date.now() };
    return { ...vysledok, z_cache: false };
  });
