import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * System health check for platform admins.
 * Verifies DB reachability, required env/secrets, recent errors/webhook failures,
 * AI availability, storage, and integration credential presence.
 */

type CheckStatus = "ok" | "warn" | "fail" | "info";
interface Check {
  key: string;
  label: string;
  status: CheckStatus;
  message: string;
  meta?: Record<string, any>;
}

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

function envCheck(key: string, required = true, placeholderHint = false): Check {
  const raw = process.env[key];
  const present = !!raw && raw.trim().length > 0;
  const looksPlaceholder =
    present &&
    placeholderHint &&
    (/^[.…]+$/.test(raw!.trim()) || raw!.trim().length < 8);
  if (!present) {
    return {
      key,
      label: key,
      status: required ? "fail" : "warn",
      message: required ? "Chýba povinný secret" : "Nenastavené (voliteľné)",
    };
  }
  if (lookspaceholder(looksPlaceholder)) {
    return { key, label: key, status: "warn", message: "Vyzerá ako placeholder hodnota" };
  }
  return { key, label: key, status: "ok", message: `Nastavené (${raw!.length} znakov)` };
}

function lookspaceholder(b: boolean) {
  return b;
}

export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await assertAdmin(context);
    const checks: Check[] = [];
    const startedAt = Date.now();

    // ── 1. Database connectivity ─────────────────────────────────────────
    const dbStart = Date.now();
    try {
      const { error } = await supabaseAdmin
        .from("companies")
        .select("id", { count: "exact", head: true });
      const ms = Date.now() - dbStart;
      if (error) {
        checks.push({ key: "db", label: "Databáza (Supabase)", status: "fail", message: error.message });
      } else {
        checks.push({
          key: "db",
          label: "Databáza (Supabase)",
          status: ms > 1500 ? "warn" : "ok",
          message: `Pripojené · ${ms} ms`,
          meta: { latency_ms: ms },
        });
      }
    } catch (e: any) {
      checks.push({ key: "db", label: "Databáza (Supabase)", status: "fail", message: e?.message ?? "Chyba pripojenia" });
    }

    // ── 2. Auth admin API ────────────────────────────────────────────────
    try {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
      checks.push({
        key: "auth_admin",
        label: "Supabase Auth Admin API",
        status: error ? "fail" : "ok",
        message: error ? error.message : `Dostupné (${data?.users?.length ?? 0} test)`,
      });
    } catch (e: any) {
      checks.push({ key: "auth_admin", label: "Supabase Auth Admin API", status: "fail", message: e?.message ?? "Nedostupné" });
    }

    // ── 3. Core secrets ──────────────────────────────────────────────────
    const coreEnvs = [
      { key: "SUPABASE_URL", required: true },
      { key: "SUPABASE_PUBLISHABLE_KEY", required: true },
      { key: "SUPABASE_SERVICE_ROLE_KEY", required: false },
      { key: "FAKTERO_SUPABASE_SERVICE_ROLE_KEY", required: false },
      { key: "APP_PUBLIC_URL", required: true },
      { key: "PAYMENT_SECRETS_KEY", required: true },
      { key: "FAKTERO_CRON_TOKEN", required: true },
      { key: "COMMANDER_SYNC_SECRET", required: false },
    ];
    for (const e of coreEnvs) checks.push({ ...envCheck(e.key, e.required, false), label: e.key });

    // service role: at least one of two must exist
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.FAKTERO_SUPABASE_SERVICE_ROLE_KEY) {
      checks.push({
        key: "service_role_any",
        label: "Service role key",
        status: "fail",
        message: "Žiadny service role key nie je nastavený (SUPABASE_SERVICE_ROLE_KEY ani FAKTERO_…)",
      });
    }

    // ── 4. Integration secrets (warn-level) ──────────────────────────────
    const integrations: Array<{ key: string; label: string }> = [
      { key: "OPENAI_API_KEY", label: "OpenAI (AI asistent)" },
      { key: "RESEND_API_KEY", label: "Resend (e-maily)" },
      { key: "GOPAY_GOID", label: "GoPay GoID" },
      { key: "GOPAY_CLIENT_ID", label: "GoPay Client ID" },
      { key: "GOPAY_CLIENT_SECRET", label: "GoPay Client Secret" },
      { key: "STRIPE_SECRET_KEY", label: "Stripe" },
      { key: "TATRABANKA_CLIENT_ID", label: "Tatra banka Client ID" },
      { key: "TATRABANKA_CLIENT_SECRET", label: "Tatra banka Secret" },
      { key: "TESLA_CLIENT_ID", label: "Tesla Client ID" },
      { key: "TESLA_CLIENT_SECRET", label: "Tesla Secret" },
      { key: "FINSTAT_API_KEY", label: "FinStat" },
    ];
    for (const i of integrations) {
      const raw = process.env[i.key];
      const present = !!raw && raw.trim().length > 0;
      const placeholder = present && (/^[.…]+$/.test(raw!.trim()) || raw!.trim().length < 8);
      checks.push({
        key: `int_${i.key}`,
        label: i.label,
        status: !present ? "warn" : placeholder ? "warn" : "ok",
        message: !present ? "Nenastavené" : placeholder ? "Placeholder hodnota — funkcia nebude fungovať" : "Nastavené",
      });
    }

    // ── 5. Storage buckets ───────────────────────────────────────────────
    try {
      const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
      checks.push({
        key: "storage",
        label: "Supabase Storage",
        status: error ? "fail" : "ok",
        message: error ? error.message : `${buckets?.length ?? 0} bucketov`,
        meta: { buckets: (buckets ?? []).map((b: any) => b.name) },
      });
    } catch (e: any) {
      checks.push({ key: "storage", label: "Supabase Storage", status: "warn", message: e?.message ?? "Nedostupné" });
    }

    // ── 6. Recent errors (last 24h) ──────────────────────────────────────
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    try {
      const [apiErr, webhookFail, emailFail] = await Promise.all([
        supabaseAdmin
          .from("api_logs")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since24h)
          .gte("status_code", 500),
        supabaseAdmin
          .from("webhook_delivery_logs")
          .select("id", { count: "exact", head: true })
          .eq("status", "failed")
          .gte("created_at", since24h),
        supabaseAdmin
          .from("invoice_email_logs")
          .select("id", { count: "exact", head: true })
          .eq("status", "failed")
          .gte("created_at", since24h),
      ]);
      checks.push({
        key: "api_errors_24h",
        label: "API chyby (5xx, 24h)",
        status: (apiErr.count ?? 0) === 0 ? "ok" : (apiErr.count ?? 0) > 50 ? "fail" : "warn",
        message: `${apiErr.count ?? 0} záznamov`,
        meta: { count: apiErr.count ?? 0 },
      });
      checks.push({
        key: "webhooks_failed_24h",
        label: "Zlyhané webhooky (24h)",
        status: (webhookFail.count ?? 0) === 0 ? "ok" : (webhookFail.count ?? 0) > 20 ? "fail" : "warn",
        message: `${webhookFail.count ?? 0} záznamov`,
        meta: { count: webhookFail.count ?? 0 },
      });
      checks.push({
        key: "emails_failed_24h",
        label: "Zlyhané e-maily (24h)",
        status: (emailFail.count ?? 0) === 0 ? "ok" : (emailFail.count ?? 0) > 20 ? "fail" : "warn",
        message: `${emailFail.count ?? 0} záznamov`,
        meta: { count: emailFail.count ?? 0 },
      });
    } catch (e: any) {
      checks.push({ key: "errors_24h", label: "Posledné chyby", status: "warn", message: e?.message ?? "Nedostupné" });
    }

    // ── 7. Recurring invoices cron ───────────────────────────────────────
    try {
      const { data: lastRun } = await supabaseAdmin
        .from("recurring_invoice_logs")
        .select("created_at, status")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastRun) {
        checks.push({ key: "cron", label: "Recurring cron", status: "info", message: "Zatiaľ žiadny beh" });
      } else {
        const ageH = (Date.now() - new Date((lastRun as any).created_at).getTime()) / 3600000;
        checks.push({
          key: "cron",
          label: "Recurring cron",
          status: ageH > 36 ? "warn" : "ok",
          message: `Posledný beh: ${Math.round(ageH)} h dozadu (${(lastRun as any).status})`,
        });
      }
    } catch {
      checks.push({ key: "cron", label: "Recurring cron", status: "info", message: "Tabuľka behu nedostupná" });
    }

    // ── Summary ──────────────────────────────────────────────────────────
    const summary = {
      ok: checks.filter((c) => c.status === "ok").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
      info: checks.filter((c) => c.status === "info").length,
      duration_ms: Date.now() - startedAt,
      generated_at: new Date().toISOString(),
    };

    return { summary, checks };
  });
