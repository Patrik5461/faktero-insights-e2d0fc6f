import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Supabase usage stats for the platform admin dashboard.
 * DB size + top public tables + storage buckets + key row counts.
 */

const FREE_DB_BYTES = 500 * 1024 * 1024; // 500 MB
const FREE_STORAGE_BYTES = 1024 * 1024 * 1024; // 1 GB

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

export const getSupabaseUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await assertAdmin(context);

    // ── DB size + tables ────────────────────────────────────────────
    let dbSizeBytes = 0;
    let tables: Array<{ schema: string; table: string; size_bytes: number; size_pretty: string }> =
      [];
    try {
      const { data, error } = await supabaseAdmin.rpc("admin_db_usage_stats" as any);
      if (error) throw error;
      const payload = data as any;
      dbSizeBytes = Number(payload?.db_size_bytes ?? 0);
      tables = (payload?.tables ?? []) as any;
    } catch (e: any) {
      // fall through with zeros
      console.error("[admin-usage] db stats failed:", e?.message);
    }

    // ── Storage buckets ─────────────────────────────────────────────
    let storageTotalBytes = 0;
    const buckets: Array<{ name: string; files: number; size_bytes: number }> = [];
    try {
      const { data: bucketList } = await supabaseAdmin.storage.listBuckets();
      for (const b of bucketList ?? []) {
        let files = 0;
        let size = 0;
        // Recursively list objects (top-level + first level of folders).
        const stack: string[] = [""];
        while (stack.length) {
          const prefix = stack.pop()!;
          const { data: objs } = await supabaseAdmin.storage
            .from(b.name)
            .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
          for (const o of objs ?? []) {
            if ((o as any).id === null || (o as any).metadata == null) {
              // folder
              stack.push(prefix ? `${prefix}/${o.name}` : o.name);
            } else {
              files += 1;
              size += Number((o as any).metadata?.size ?? 0);
            }
          }
        }
        buckets.push({ name: b.name, files, size_bytes: size });
        storageTotalBytes += size;
      }
    } catch (e: any) {
      console.error("[admin-usage] storage stats failed:", e?.message);
    }

    // ── Row counts ──────────────────────────────────────────────────
    const rowCounts: Record<string, number> = {};
    await Promise.all(
      ROW_COUNT_TABLES.map(async (t) => {
        try {
          const { count } = await supabaseAdmin.from(t).select("*", { count: "exact", head: true });
          rowCounts[t] = count ?? 0;
        } catch {
          rowCounts[t] = 0;
        }
      }),
    );

    return {
      db: {
        used_bytes: dbSizeBytes,
        limit_bytes: FREE_DB_BYTES,
        tables,
      },
      storage: {
        used_bytes: storageTotalBytes,
        limit_bytes: FREE_STORAGE_BYTES,
        buckets,
      },
      row_counts: rowCounts,
      generated_at: new Date().toISOString(),
    };
  });
