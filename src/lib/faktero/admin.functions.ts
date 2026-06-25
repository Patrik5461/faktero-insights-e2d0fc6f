import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side admin functions. Every handler authorizes via
 * is_platform_admin(auth.uid()); non-admins receive 403.
 * Reads use supabaseAdmin (loaded inside the handler) so admins can
 * aggregate across all companies regardless of RLS.
 * Sensitive fields are masked or omitted before returning to the client.
 */

async function getAdmin(context: { userId: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_admins")
    .select("role")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw new Error("Admin check failed");
  if (!data) throw new Error("Forbidden: not a platform admin");
  return { supabaseAdmin, role: data.role as "admin" | "superadmin" };
}

function mask(value: string | null | undefined, keep = 4): string | null {
  if (!value) return null;
  if (value.length <= keep) return "•".repeat(value.length);
  return "•".repeat(Math.max(4, value.length - keep)) + value.slice(-keep);
}

async function logAudit(
  supabaseAdmin: any,
  adminUserId: string,
  action: string,
  entityType: string | null,
  entityId: string | null,
  metadata: Record<string, any> = {}
) {
  await supabaseAdmin.from("platform_audit_logs").insert({
    admin_user_id: adminUserId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}

// ── Identity ────────────────────────────────────────────────────────────
export const getMyAdminRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("platform_admins")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { role: (data?.role as string | undefined) ?? null };
  });

// ── Overview ────────────────────────────────────────────────────────────
export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    const monthStart = since.toISOString();

    const [companies, users, activeCompanies, invoicesMonth, apiMonth, emailsMonth, failedWebhooks] =
      await Promise.all([
        supabaseAdmin.from("companies").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("companies").select("id", { count: "exact", head: true }).is("suspended_at", null),
        supabaseAdmin.from("invoices").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
        supabaseAdmin.from("api_logs").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
        supabaseAdmin.from("invoice_email_logs").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
        supabaseAdmin.from("webhook_delivery_logs").select("id", { count: "exact", head: true }).eq("status", "failed"),
      ]);

    return {
      totalCompanies: companies.count ?? 0,
      totalUsers: users.count ?? 0,
      activeCompanies: activeCompanies.count ?? 0,
      invoicesMonth: invoicesMonth.count ?? 0,
      apiMonth: apiMonth.count ?? 0,
      emailsMonth: emailsMonth.count ?? 0,
      failedWebhooks: failedWebhooks.count ?? 0,
      // Placeholders — GoPay not yet wired
      revenueCents: null as number | null,
      trialAccounts: null as number | null,
    };
  });

// ── Companies ───────────────────────────────────────────────────────────
const ListInput = z.object({
  q: z.string().max(120).optional().default(""),
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
  suspended: z.enum(["all", "active", "suspended"]).default("all"),
});

export const listAdminCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = supabaseAdmin
      .from("companies")
      .select("id, name, ico, dic, country, created_at, suspended_at, created_by", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (data.q.trim()) {
      const term = data.q.trim().replace(/[%_,]/g, "");
      q = q.or(`name.ilike.%${term}%,ico.ilike.%${term}%,dic.ilike.%${term}%`);
    }
    if (data.suspended === "active") q = q.is("suspended_at", null);
    if (data.suspended === "suspended") q = q.not("suspended_at", "is", null);
    const { data: rows, count, error } = await q;
    if (error) throw error;

    const ids = (rows ?? []).map((r) => r.id);
    const ownerIds = (rows ?? []).map((r) => r.created_by).filter(Boolean) as string[];

    const [profiles, userCounts, invoiceCounts, subs] = await Promise.all([
      ownerIds.length
        ? supabaseAdmin.from("profiles").select("id, email, full_name").in("id", ownerIds)
        : Promise.resolve({ data: [] as any[] }),
      ids.length
        ? supabaseAdmin
            .from("company_users")
            .select("company_id")
            .in("company_id", ids)
            .then(({ data }) => {
              const m = new Map<string, number>();
              (data ?? []).forEach((r: any) => m.set(r.company_id, (m.get(r.company_id) ?? 0) + 1));
              return m;
            })
        : Promise.resolve(new Map<string, number>()),
      ids.length
        ? supabaseAdmin
            .from("invoices")
            .select("company_id")
            .in("company_id", ids)
            .is("deleted_at", null)
            .then(({ data }) => {
              const m = new Map<string, number>();
              (data ?? []).forEach((r: any) => m.set(r.company_id, (m.get(r.company_id) ?? 0) + 1));
              return m;
            })
        : Promise.resolve(new Map<string, number>()),
      ids.length
        ? supabaseAdmin
            .from("subscriptions")
            .select("company_id, plan, status")
            .in("company_id", ids)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const profileMap = new Map<string, any>(
      ((profiles as any).data ?? []).map((p: any) => [p.id, p])
    );
    const subMap = new Map<string, any>(
      ((subs as any).data ?? []).map((s: any) => [s.company_id, s])
    );

    return {
      rows: (rows ?? []).map((r) => {
        const owner = r.created_by ? profileMap.get(r.created_by) : null;
        const sub = subMap.get(r.id);
        return {
          id: r.id,
          name: r.name,
          ico: r.ico,
          dic: r.dic,
          country: r.country,
          created_at: r.created_at,
          suspended_at: r.suspended_at,
          owner_email: owner?.email ?? null,
          owner_name: owner?.full_name ?? null,
          users_count: (userCounts as Map<string, number>).get(r.id) ?? 0,
          invoices_count: (invoiceCounts as Map<string, number>).get(r.id) ?? 0,
          plan: sub?.plan ?? "free",
          status: sub?.status ?? "trialing",
        };
      }),
      total: count ?? 0,
    };
  });

export const getAdminCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const { data: c, error } = await supabaseAdmin
      .from("companies")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !c) throw new Error("Company not found");

    const [users, invoices, sub, lastInvoice, lastApi] = await Promise.all([
      supabaseAdmin
        .from("company_users")
        .select("user_id, role, created_at")
        .eq("company_id", data.id),
      supabaseAdmin
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("company_id", data.id)
        .is("deleted_at", null),
      supabaseAdmin.from("subscriptions").select("*").eq("company_id", data.id).maybeSingle(),
      supabaseAdmin
        .from("invoices")
        .select("created_at")
        .eq("company_id", data.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("api_logs")
        .select("created_at")
        .eq("company_id", data.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const userIds = (users.data ?? []).map((u: any) => u.user_id);
    const { data: profs } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", userIds)
      : { data: [] as any[] };
    const profMap = new Map<string, any>(((profs as any) ?? []).map((p: any) => [p.id, p]));

    await logAudit(supabaseAdmin, context.userId, "view_company", "company", data.id, {
      name: c.name,
    });

    // Mask sensitive fields. Drop bank tokens/secrets entirely.
    return {
      company: {
        id: c.id,
        name: c.name,
        ico: c.ico,
        dic: c.dic,
        ic_dph: c.ic_dph,
        street: c.street,
        city: c.city,
        zip: c.zip,
        country: c.country,
        email: c.email,
        phone: c.phone,
        iban: mask(c.iban, 4),
        default_currency: c.default_currency,
        created_at: c.created_at,
        suspended_at: c.suspended_at,
        suspended_reason: c.suspended_reason,
      },
      subscription: sub.data
        ? {
            plan: sub.data.plan,
            status: sub.data.status,
            trial_ends_at: sub.data.trial_ends_at,
            current_period_end: sub.data.current_period_end,
            next_billing_at: sub.data.next_billing_at,
            monthly_price_cents: sub.data.monthly_price_cents,
            payment_provider: sub.data.payment_provider,
            external_subscription_id: mask(sub.data.external_subscription_id, 4),
          }
        : null,
      users: (users.data ?? []).map((u: any) => ({
        user_id: u.user_id,
        role: u.role,
        created_at: u.created_at,
        email: profMap.get(u.user_id)?.email ?? null,
        full_name: profMap.get(u.user_id)?.full_name ?? null,
      })),
      invoicesCount: invoices.count ?? 0,
      lastInvoiceAt: (lastInvoice.data as any)?.created_at ?? null,
      lastApiAt: (lastApi.data as any)?.created_at ?? null,
    };
  });

export const suspendCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; reason: string }) =>
    z.object({ id: z.string().uuid(), reason: z.string().min(1).max(500) }).parse(input)
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const { error } = await supabaseAdmin
      .from("companies")
      .update({ suspended_at: new Date().toISOString(), suspended_reason: data.reason })
      .eq("id", data.id);
    if (error) throw error;
    await logAudit(supabaseAdmin, context.userId, "suspend_company", "company", data.id, {
      reason: data.reason,
    });
    return { ok: true };
  });

export const reactivateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const { error } = await supabaseAdmin
      .from("companies")
      .update({ suspended_at: null, suspended_reason: null })
      .eq("id", data.id);
    if (error) throw error;
    await logAudit(supabaseAdmin, context.userId, "reactivate_company", "company", data.id, {});
    return { ok: true };
  });

// ── Users ───────────────────────────────────────────────────────────────
export const listAdminUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, created_at, updated_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (data.q.trim()) {
      const term = data.q.trim().replace(/[%_,]/g, "");
      q = q.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
    }
    const { data: rows, count, error } = await q;
    if (error) throw error;
    const ids = (rows ?? []).map((r: any) => r.id);
    const { data: memberships } = ids.length
      ? await supabaseAdmin
          .from("company_users")
          .select("user_id, role, companies(id, name)")
          .in("user_id", ids)
      : { data: [] as any[] };
    const membershipMap = new Map<string, any[]>();
    ((memberships as any) ?? []).forEach((m: any) => {
      const list = membershipMap.get(m.user_id) ?? [];
      list.push({ company_id: m.companies?.id, name: m.companies?.name, role: m.role });
      membershipMap.set(m.user_id, list);
    });
    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        companies: membershipMap.get(r.id) ?? [],
      })),
      total: count ?? 0,
    };
  });

// ── Subscriptions ───────────────────────────────────────────────────────
export const listAdminSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: rows, count, error } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "id, company_id, plan, status, trial_ends_at, current_period_start, current_period_end, next_billing_at, monthly_price_cents, payment_provider, gopay_payment_id, cancel_at_period_end, companies(name, ico)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    // last payment per company
    const ids = (rows ?? []).map((r: any) => r.company_id);
    const lastPaymentByCompany = new Map<string, any>();
    if (ids.length) {
      const { data: pays } = await supabaseAdmin
        .from("billing_payments")
        .select("company_id, status, amount_cents, paid_at, created_at")
        .in("company_id", ids)
        .order("created_at", { ascending: false });
      (pays ?? []).forEach((p: any) => {
        if (!lastPaymentByCompany.has(p.company_id)) lastPaymentByCompany.set(p.company_id, p);
      });
    }
    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        last_payment: lastPaymentByCompany.get(r.company_id) ?? null,
      })),
      total: count ?? 0,
    };
  });

// Admin actions on subscriptions
export const adminSetCompanyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      companyId: z.string().uuid(),
      planSlug: z.enum(["starter", "business", "premium", "enterprise"]),
    }).parse(input)
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const { data: plan } = await supabaseAdmin
      .from("subscription_plans").select("id, price_monthly_cents")
      .eq("slug", data.planSlug).single();
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({
        plan: data.planSlug,
        plan_id: plan?.id ?? null,
        monthly_price_cents: plan?.price_monthly_cents ?? null,
        status: "active",
      })
      .eq("company_id", data.companyId);
    if (error) throw error;
    await logAudit(supabaseAdmin, context.userId, "admin_set_plan", "company", data.companyId, { plan: data.planSlug });
    return { ok: true };
  });

export const adminExtendTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ companyId: z.string().uuid(), days: z.number().int().min(1).max(365) }).parse(input)
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const { data: sub } = await supabaseAdmin
      .from("subscriptions").select("trial_ends_at").eq("company_id", data.companyId).maybeSingle();
    const base = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : new Date();
    base.setUTCDate(base.getUTCDate() + data.days);
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ trial_ends_at: base.toISOString(), status: "trialing" })
      .eq("company_id", data.companyId);
    if (error) throw error;
    await logAudit(supabaseAdmin, context.userId, "admin_extend_trial", "company", data.companyId, { days: data.days });
    return { ok: true, trial_ends_at: base.toISOString() };
  });

export const adminCancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ status: "cancelled", cancel_at_period_end: true })
      .eq("company_id", data.companyId);
    if (error) throw error;
    await logAudit(supabaseAdmin, context.userId, "admin_cancel_subscription", "company", data.companyId, {});
    return { ok: true };
  });

export const adminReactivateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ status: "active", cancel_at_period_end: false, billing_suspended: false })
      .eq("company_id", data.companyId);
    if (error) throw error;
    await logAudit(supabaseAdmin, context.userId, "admin_reactivate_subscription", "company", data.companyId, {});
    return { ok: true };
  });

// ── Mark subscription active manually (admin override) ──────────────────
export const adminMarkActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      companyId: z.string().uuid(),
      days: z.number().int().min(1).max(3650).default(30),
    }).parse(input)
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const now = new Date();
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() + data.days);
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({
        status: "active",
        billing_suspended: false,
        cancel_at_period_end: false,
        current_period_start: now.toISOString(),
        current_period_end: end.toISOString(),
        next_billing_at: end.toISOString(),
      })
      .eq("company_id", data.companyId);
    if (error) throw error;
    await logAudit(supabaseAdmin, context.userId, "admin_mark_active", "company", data.companyId, { days: data.days });
    return { ok: true, current_period_end: end.toISOString() };
  });

// ── Suspend billing (no writes allowed; read-only mode) ─────────────────
export const adminSuspendBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ companyId: z.string().uuid(), suspend: z.boolean() }).parse(input)
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ billing_suspended: data.suspend })
      .eq("company_id", data.companyId);
    if (error) throw error;
    await logAudit(
      supabaseAdmin,
      context.userId,
      data.suspend ? "admin_suspend_billing" : "admin_unsuspend_billing",
      "company",
      data.companyId,
      {}
    );
    return { ok: true };
  });

// ── GoPay diagnostics ───────────────────────────────────────────────────
export const listGopayEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      limit: z.number().int().min(10).max(200).default(50),
      page: z.number().int().min(1).default(1),
    }).parse(input)
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const from = (data.page - 1) * data.limit;
    const to = from + data.limit - 1;
    const [{ data: events, count: eventsCount }, { data: failedPayments }] = await Promise.all([
      supabaseAdmin
        .from("billing_events")
        .select("id, company_id, event_type, payload, created_at", { count: "exact" })
        .like("event_type", "gopay_%")
        .order("created_at", { ascending: false })
        .range(from, to),
      supabaseAdmin
        .from("billing_payments")
        .select("id, company_id, plan_slug, amount_cents, status, provider_payment_id, created_at")
        .eq("provider", "gopay")
        .not("status", "in", '("PAID","CREATED")')
        .order("created_at", { ascending: false })
        .limit(data.limit),
    ]);
    return {
      events: events ?? [],
      eventsTotal: eventsCount ?? 0,
      page: data.page,
      pageSize: data.limit,
      failedPayments: failedPayments ?? [],
    };
  });

// ── Runtime config diagnostics (masked) ─────────────────────────────────
export const getBillingDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await getAdmin(context);
    const appUrl = process.env.APP_PUBLIC_URL ?? null;
    const webhookSecret = process.env.GOPAY_WEBHOOK_SECRET ?? null;
    const gopayEnv = process.env.GOPAY_ENV ?? null;

    function maskUrl(u: string | null): string | null {
      if (!u) return null;
      try { const x = new URL(u); return `${x.protocol}//${x.host}`; } catch { return u; }
    }
    function maskSecret(s: string | null): string | null {
      if (!s) return null;
      if (s.length <= 6) return "•".repeat(s.length);
      return s.slice(0, 2) + "•".repeat(Math.max(4, s.length - 4)) + s.slice(-2);
    }

    const warnings: string[] = [];
    if (!appUrl) warnings.push("APP_PUBLIC_URL nie je nastavené — GoPay return/notify URL používa fallback https://faktero.sk.");
    if (!webhookSecret) warnings.push("GOPAY_WEBHOOK_SECRET chýba — webhook bude odmietať volania s 401.");
    if (appUrl && /\.lovable\.app/i.test(appUrl) === false && gopayEnv === "sandbox") {
      // ok
    }
    return {
      app_public_url: maskUrl(appUrl),
      app_public_url_set: !!appUrl,
      gopay_env: gopayEnv,
      webhook_secret_set: !!webhookSecret,
      webhook_secret_preview: maskSecret(webhookSecret),
      webhook_notify_url: appUrl
        ? `${appUrl.replace(/\/$/, "")}/api/webhooks/gopay?secret=•••••`
        : null,
      warnings,
    };
  });

export const adminSyncPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ providerPaymentId: z.string().min(1).max(64) }).parse(input)
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const { syncGopayPaymentById } = await import("@/lib/faktero/billing-sync.server");
    const res = await syncGopayPaymentById(data.providerPaymentId);
    await logAudit(supabaseAdmin, context.userId, "admin_sync_gopay_payment", "payment", data.providerPaymentId, { state: res.state });
    return res;
  });

// ── Beta readiness checklist: env/secret presence only (no values) ─────
export const getBetaChecklistStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await getAdmin(context);

    // Diagnostic counts + most-recent rows (no PII beyond IDs/timestamps)
    const [bp, bpLatest, be, apiCount, apiLatest, hookCount, hookLatest] = await Promise.all([
      supabaseAdmin.from("billing_payments").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("billing_payments")
        .select("id, provider_payment_id, status, amount_cents, currency, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("billing_events")
        .select("id, event_type, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin.from("api_logs").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("api_logs")
        .select("id, method, path, status, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin.from("webhook_delivery_logs").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("webhook_delivery_logs")
        .select("id, event_type, status, response_status, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      gopay_webhook_secret: !!process.env.GOPAY_WEBHOOK_SECRET,
      app_public_url: !!process.env.APP_PUBLIC_URL,
      gopay_client_id: !!process.env.GOPAY_CLIENT_ID,
      gopay_client_secret: !!process.env.GOPAY_CLIENT_SECRET,
      gopay_goid: !!process.env.GOPAY_GOID,
      gopay_env: process.env.GOPAY_ENV ?? null,
      finstat_public_key: !!process.env.FINSTAT_PUBLIC_KEY,
      finstat_private_key: !!process.env.FINSTAT_PRIVATE_KEY,
      resend_api_key: !!process.env.RESEND_API_KEY,
      lovable_api_key: !!process.env.LOVABLE_API_KEY,
      billing: {
        payments_count: bp.count ?? 0,
        latest_payment: (bpLatest as any).data ?? null,
        latest_event: (be as any).data ?? null,
      },
      api: {
        logs_count: apiCount.count ?? 0,
        latest: (apiLatest as any).data ?? null,
      },
      webhooks: {
        deliveries_count: hookCount.count ?? 0,
        latest: (hookLatest as any).data ?? null,
      },
    };
  });

// ── Usage ───────────────────────────────────────────────────────────────
export const getAdminUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    const monthStart = since.toISOString();

    const [invoicesByCompany, apiByCompany, emailsByCompany, webhooksByCompany] = await Promise.all([
      supabaseAdmin.from("invoices").select("company_id").gte("created_at", monthStart).is("deleted_at", null),
      supabaseAdmin.from("api_logs").select("company_id").gte("created_at", monthStart),
      supabaseAdmin.from("invoice_email_logs").select("company_id").gte("created_at", monthStart),
      supabaseAdmin.from("webhook_delivery_logs").select("company_id").gte("created_at", monthStart),
    ]);

    function group(list: any[]): Map<string, number> {
      const m = new Map<string, number>();
      (list ?? []).forEach((r: any) => m.set(r.company_id, (m.get(r.company_id) ?? 0) + 1));
      return m;
    }
    const inv = group((invoicesByCompany as any).data ?? []);
    const api = group((apiByCompany as any).data ?? []);
    const emails = group((emailsByCompany as any).data ?? []);
    const hooks = group((webhooksByCompany as any).data ?? []);

    const ids = new Set([...inv.keys(), ...api.keys(), ...emails.keys(), ...hooks.keys()]);
    const { data: companies } = ids.size
      ? await supabaseAdmin.from("companies").select("id, name").in("id", Array.from(ids))
      : { data: [] as any[] };
    const nameMap = new Map<string, string>(((companies as any) ?? []).map((c: any) => [c.id, c.name]));

    const rows = Array.from(ids).map((id) => ({
      company_id: id,
      name: nameMap.get(id) ?? "—",
      invoices: inv.get(id) ?? 0,
      api_calls: api.get(id) ?? 0,
      emails: emails.get(id) ?? 0,
      webhooks: hooks.get(id) ?? 0,
      pdfs: inv.get(id) ?? 0, // PDFs generated ≈ invoices issued (no separate counter)
      storage_mb: null as number | null, // not measured yet
    }));
    rows.sort((a, b) => b.api_calls + b.invoices * 10 - (a.api_calls + a.invoices * 10));
    return { rows };
  });

// ── Errors ──────────────────────────────────────────────────────────────
const ErrorSource = z.enum(["all", "api", "webhook", "email", "finstat", "efaktura"]);
export const listAdminErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        source: ErrorSource.default("all"),
        limit: z.number().int().min(10).max(200).default(50),
      })
      .parse(input)
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const limit = data.limit;

    type Row = {
      source: string;
      company_id: string | null;
      created_at: string;
      summary: string;
      detail: string | null;
      status: string | number | null;
    };
    const rows: Row[] = [];

    if (data.source === "all" || data.source === "api") {
      const { data: r } = await supabaseAdmin
        .from("api_logs")
        .select("company_id, method, path, status, created_at")
        .gte("status", 400)
        .order("created_at", { ascending: false })
        .limit(limit);
      (r ?? []).forEach((x: any) =>
        rows.push({
          source: "api",
          company_id: x.company_id,
          created_at: x.created_at,
          summary: `${x.method} ${x.path}`,
          detail: null,
          status: x.status,
        })
      );
    }
    if (data.source === "all" || data.source === "webhook") {
      const { data: r } = await supabaseAdmin
        .from("webhook_delivery_logs")
        .select("company_id, event_type, status, error_message, response_status, created_at")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(limit);
      (r ?? []).forEach((x: any) =>
        rows.push({
          source: "webhook",
          company_id: x.company_id,
          created_at: x.created_at,
          summary: x.event_type,
          detail: x.error_message,
          status: x.response_status,
        })
      );
    }
    if (data.source === "all" || data.source === "email") {
      const { data: r } = await supabaseAdmin
        .from("invoice_email_logs")
        .select("company_id, recipient_email, status, error_message, created_at")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(limit);
      (r ?? []).forEach((x: any) =>
        rows.push({
          source: "email",
          company_id: x.company_id,
          created_at: x.created_at,
          summary: `to ${x.recipient_email}`,
          detail: x.error_message,
          status: x.status,
        })
      );
    }
    if (data.source === "all" || data.source === "finstat") {
      const { data: r } = await supabaseAdmin
        .from("company_lookup_logs")
        .select("company_id, ico, provider, status, error_message, created_at")
        .eq("status", "error")
        .order("created_at", { ascending: false })
        .limit(limit);
      (r ?? []).forEach((x: any) =>
        rows.push({
          source: "finstat",
          company_id: x.company_id,
          created_at: x.created_at,
          summary: `${x.provider} · IČO ${x.ico}`,
          detail: x.error_message,
          status: x.status,
        })
      );
    }
    if (data.source === "all" || data.source === "efaktura") {
      const { data: r } = await supabaseAdmin
        .from("efaktura_documents")
        .select("company_id, document_number, status, validation_errors, created_at")
        .eq("status", "invalid")
        .order("created_at", { ascending: false })
        .limit(limit);
      (r ?? []).forEach((x: any) =>
        rows.push({
          source: "efaktura",
          company_id: x.company_id,
          created_at: x.created_at,
          summary: `Doc ${x.document_number ?? "—"}`,
          detail: JSON.stringify(x.validation_errors ?? null),
          status: x.status,
        })
      );
    }
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return { rows: rows.slice(0, limit) };
  });

// ── Audit log ───────────────────────────────────────────────────────────
export const listAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        page: z.number().int().min(1).max(1000).default(1),
        pageSize: z.number().int().min(10).max(100).default(50),
      })
      .parse(input)
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: rows, count, error } = await supabaseAdmin
      .from("platform_audit_logs")
      .select("id, admin_user_id, action, entity_type, entity_id, metadata, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.admin_user_id).filter(Boolean)));
    const { data: profs } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", ids)
      : { data: [] as any[] };
    const profMap = new Map<string, any>(((profs as any) ?? []).map((p: any) => [p.id, p]));
    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        admin_email: profMap.get(r.admin_user_id)?.email ?? null,
        admin_name: profMap.get(r.admin_user_id)?.full_name ?? null,
      })),
      total: count ?? 0,
    };
  });