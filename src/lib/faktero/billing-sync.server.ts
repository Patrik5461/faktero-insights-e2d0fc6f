/**
 * Server-only helper that re-syncs a GoPay payment by id.
 * Used by both the user "Sync payment status" button and the admin
 * "Retry status sync" action. Idempotent: writes go through the same
 * upsert/update path as the webhook handler.
 */
import { gopayGetPayment } from "@/lib/faktero/gopay.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function syncGopayPaymentById(paymentId: string) {
  const payment = await gopayGetPayment(paymentId);
  const state = String(payment.state ?? "");

  const { data: existing } = await supabaseAdmin
    .from("billing_payments")
    .select("id, company_id, plan_slug, status")
    .eq("provider", "gopay")
    .eq("provider_payment_id", String(payment.id))
    .maybeSingle();

  if (!existing) {
    await supabaseAdmin.from("billing_events").insert({
      company_id: null,
      event_type: "gopay_sync_unknown",
      payload: { id: String(payment.id), state },
    });
    return { state, applied: false };
  }

  const isPaid = state === "PAID";
  await supabaseAdmin
    .from("billing_payments")
    .update({
      status: state,
      paid_at: isPaid ? new Date().toISOString() : null,
      raw_response: payment as any,
    })
    .eq("id", existing.id);

  if (isPaid && existing.plan_slug) {
    const { data: plan } = await supabaseAdmin
      .from("subscription_plans")
      .select("id, price_monthly_cents")
      .eq("slug", existing.plan_slug)
      .maybeSingle();
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    await supabaseAdmin
      .from("subscriptions")
      .update({
        plan: existing.plan_slug,
        plan_id: plan?.id ?? null,
        status: "active",
        billing_suspended: false,
        monthly_price_cents: plan?.price_monthly_cents ?? null,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        next_billing_at: periodEnd.toISOString(),
        gopay_payment_id: String(payment.id),
        cancel_at_period_end: false,
        payment_provider: "gopay",
      })
      .eq("company_id", existing.company_id);
  }

  await supabaseAdmin.from("billing_events").insert({
    company_id: existing.company_id,
    event_type: `gopay_sync_${state.toLowerCase() || "unknown"}`,
    payload: { id: String(payment.id), state },
  });

  if (isPaid) {
    try {
      const { issueSubscriptionInvoiceForPayment } = await import(
        "./subscription-invoice.server"
      );
      await issueSubscriptionInvoiceForPayment(existing.id);
    } catch (e: any) {
      await supabaseAdmin.from("billing_events").insert({
        company_id: existing.company_id,
        event_type: "platform_invoice_error",
        payload: { error: String(e?.message ?? e), source: "sync" } as any,
      });
    }
  }

  return { state, applied: true };
}