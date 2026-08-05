import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const IdInput = z.object({ id: z.string().uuid() });

async function assertMember(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("company_users")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

/** Run a recurring template now (manual trigger). Returns invoice_id. */
export const runRecurringNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rec, error } = await context.supabase
      .from("recurring_invoices")
      .select("id, company_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !rec) throw new Error("Šablóna nenájdená");
    await assertMember(context.supabase, context.userId, rec.company_id);
    const { runRecurring } = await import("./recurring.server");
    return runRecurring(rec.id, "manual");
  });

const ToggleInput = z.object({ id: z.string().uuid(), active: z.boolean() });
export const toggleRecurring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ToggleInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rec } = await context.supabase
      .from("recurring_invoices")
      .select("id, company_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!rec) throw new Error("Šablóna nenájdená");
    await assertMember(context.supabase, context.userId, rec.company_id);
    const { error } = await context.supabase
      .from("recurring_invoices")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lightweight stats for the dashboard recurring widget. */
export const getRecurringWidgetStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: memberships } = await context.supabase
      .from("company_users")
      .select("company_id")
      .eq("user_id", context.userId);
    const companyIds = (memberships ?? []).map((m: any) => m.company_id);
    if (!companyIds.length) {
      return {
        last_success_at: null as string | null,
        next_run: null as string | null,
        failed_24h: 0,
        active_templates: 0,
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [lastOk, nextDue, failed, active] = await Promise.all([
      supabaseAdmin
        .from("recurring_invoice_logs")
        .select("created_at")
        .in("company_id", companyIds)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("recurring_invoices")
        .select("next_run")
        .in("company_id", companyIds)
        .eq("active", true)
        .order("next_run", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("recurring_invoice_logs")
        .select("id", { count: "exact", head: true })
        .in("company_id", companyIds)
        .eq("status", "failed")
        .gte("created_at", since),
      supabaseAdmin
        .from("recurring_invoices")
        .select("id", { count: "exact", head: true })
        .in("company_id", companyIds)
        .eq("active", true),
    ]);
    return {
      last_success_at: (lastOk.data as any)?.created_at ?? null,
      next_run: (nextDue.data as any)?.next_run ?? null,
      failed_24h: failed.count ?? 0,
      active_templates: active.count ?? 0,
    };
  });

/** Admin diagnostics: cron status, last execution, recent failures. */
export const getRecurringDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Caller must be owner/admin of at least one company.
    const { data: memberships } = await context.supabase
      .from("company_users")
      .select("company_id, role")
      .eq("user_id", context.userId);
    const adminCompanies = (memberships ?? []).filter(
      (m: any) => m.role === "owner" || m.role === "admin",
    );
    if (!adminCompanies.length) throw new Error("Forbidden");
    const companyIds = adminCompanies.map((m: any) => m.company_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let cron_job: any = null;
    let last_runs: any[] = [];
    try {
      const { data: status } = await (supabaseAdmin as any).rpc("faktero_recurring_cron_status");
      cron_job = (status as any)?.job ?? null;
      last_runs = (status as any)?.runs ?? [];
    } catch {
      // RPC existuje len keď je pg_cron nainštalovaný — diagnostika sa zobrazí prázdna
    }

    const [recentLogs, failed7d] = await Promise.all([
      supabaseAdmin
        .from("recurring_invoice_logs")
        .select(
          "id, recurring_invoice_id, invoice_id, status, error_message, run_type, created_at, company_id",
        )
        .in("company_id", companyIds)
        .order("created_at", { ascending: false })
        .limit(25),
      supabaseAdmin
        .from("recurring_invoice_logs")
        .select("id", { count: "exact", head: true })
        .in("company_id", companyIds)
        .eq("status", "failed")
        .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
    ]);

    return {
      cron: {
        configured: !!cron_job,
        jobname: cron_job?.jobname ?? "faktero-recurring-daily",
        schedule: cron_job?.schedule ?? null,
        active: cron_job?.active ?? null,
      },
      last_runs,
      failed_7d: failed7d.count ?? 0,
      recent_logs: recentLogs.data ?? [],
    };
  });
