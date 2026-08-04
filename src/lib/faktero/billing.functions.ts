import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCompanyPlan } from "@/lib/faktero/plan-enforcement";

const CompanyInput = z.object({ companyId: z.string().uuid() });
const CheckoutInput = z.object({
  companyId: z.string().uuid(),
  planSlug: z.enum(["starter", "premium", "enterprise"]),
});

async function assertCompanyAdmin(supabase: any, companyId: string, userId: string) {
  const { data } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !["owner", "admin"].includes(data.role)) {
    throw new Error("Forbidden");
  }
}

function publicBaseUrl(): string {
  const env = process.env.APP_PUBLIC_URL?.replace(/\/$/, "");
  if (env) return env;
  return "https://faktero.sk";
}

function gopayNotifyUrl(): string {
  const base = publicBaseUrl();
  const secret = process.env.GOPAY_WEBHOOK_SECRET;
  return secret
    ? `${base}/api/webhooks/gopay?secret=${encodeURIComponent(secret)}`
    : `${base}/api/webhooks/gopay`;
}

function monthStartIso(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// ── List plans (public) ─────────────────────────────────────────────────
export const listPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("subscription_plans")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
});

// ── Current billing snapshot ────────────────────────────────────────────
export const getMyBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CompanyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Membership check via RLS happens automatically; explicit guard for clarity.
    const { data: member } = await supabase
      .from("company_users")
      .select("role")
      .eq("company_id", data.companyId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) throw new Error("Not a member of this company");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const plan = await getCompanyPlan(supabaseAdmin, data.companyId);

    const [invoicesMonth, usersCount] = await Promise.all([
      supabaseAdmin
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("company_id", data.companyId)
        .gte("created_at", monthStartIso())
        .is("deleted_at", null),
      supabaseAdmin
        .from("company_users")
        .select("user_id", { count: "exact", head: true })
        .eq("company_id", data.companyId),
    ]);

    return {
      plan,
      usage: {
        invoices_this_month: invoicesMonth.count ?? 0,
        users_count: usersCount.count ?? 0,
      },
      role: member.role as string,
    };
  });

// ── Payment history ─────────────────────────────────────────────────────
export const getPaymentHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CompanyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("billing_payments")
      .select(
        "id, amount_cents, currency, status, provider, provider_payment_id, paid_at, created_at, plan_slug",
      )
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return rows ?? [];
  });

// ── Create GoPay checkout ───────────────────────────────────────────────
export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CheckoutInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCompanyAdmin(supabaseAdmin, data.companyId, context.userId);

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("subscription_plans")
      .select("id, slug, name, price_monthly_cents, active")
      .eq("slug", data.planSlug)
      .single();
    if (planErr || !plan || !plan.active || plan.price_monthly_cents == null) {
      throw new Error("Plán nie je dostupný");
    }

    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("id, name, email")
      .eq("id", data.companyId)
      .single();
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const payerEmail = company?.email ?? profile?.email;
    if (!payerEmail) throw new Error("Chýba email pre platbu");

    const orderNumber = `FK-${data.companyId.slice(0, 8)}-${Date.now()}`;
    const base = publicBaseUrl();
    const { gopayCreatePayment } = await import("@/lib/faktero/gopay.server");
    const payment = await gopayCreatePayment({
      amountCents: plan.price_monthly_cents,
      currency: "EUR",
      orderNumber,
      orderDescription: `Faktero ${plan.name} — mesačné predplatné`,
      returnUrl: `${base}/predplatne?payment=return`,
      notifyUrl: gopayNotifyUrl(),
      payerEmail,
      payerFullName: profile?.full_name ?? undefined,
      lang: "SK",
    });

    // Pre-create pending billing_payments row
    await supabaseAdmin.from("billing_payments").upsert(
      {
        company_id: data.companyId,
        plan_slug: plan.slug,
        amount_cents: plan.price_monthly_cents,
        currency: "EUR",
        status: String(payment.state ?? "CREATED"),
        provider: "gopay",
        provider_payment_id: String(payment.id),
      },
      { onConflict: "provider,provider_payment_id" },
    );

    await supabaseAdmin.from("billing_events").insert({
      company_id: data.companyId,
      event_type: "checkout_created",
      payload: { payment_id: String(payment.id), plan: plan.slug, order_number: orderNumber },
    });

    if (!payment.gw_url) throw new Error("GoPay nevrátil URL platobnej brány");
    return { gw_url: payment.gw_url, payment_id: String(payment.id) };
  });

// ── Cancel / reactivate (period-end) ────────────────────────────────────
export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CompanyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCompanyAdmin(supabaseAdmin, data.companyId, context.userId);
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ cancel_at_period_end: true })
      .eq("company_id", data.companyId);
    if (error) throw error;
    await supabaseAdmin.from("billing_events").insert({
      company_id: data.companyId,
      event_type: "subscription_cancel_scheduled",
      payload: {},
    });
    return { ok: true };
  });

export const reactivateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CompanyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCompanyAdmin(supabaseAdmin, data.companyId, context.userId);
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ cancel_at_period_end: false })
      .eq("company_id", data.companyId);
    if (error) throw error;
    await supabaseAdmin.from("billing_events").insert({
      company_id: data.companyId,
      event_type: "subscription_reactivated",
      payload: {},
    });
    return { ok: true };
  });

// ── Sync latest GoPay payment status ────────────────────────────────────
export const syncMyLatestPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CompanyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCompanyAdmin(supabaseAdmin, data.companyId, context.userId);
    const { data: latest } = await supabaseAdmin
      .from("billing_payments")
      .select("id, provider_payment_id, plan_slug, company_id, status")
      .eq("company_id", data.companyId)
      .eq("provider", "gopay")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest) return { ok: false, reason: "no_payment" };
    if (!latest.provider_payment_id) {
      return {
        ok: false,
        reason: "missing_payment_id",
        error: "Posledná platba nemá GoPay ID — skúste znova vytvoriť platbu.",
      };
    }
    const { syncGopayPaymentById } = await import("@/lib/faktero/billing-sync.server");
    const res = await syncGopayPaymentById(latest.provider_payment_id);
    return { ok: true, state: res.state };
  });
