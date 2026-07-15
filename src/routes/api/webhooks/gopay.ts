import { createFileRoute } from "@tanstack/react-router";

/**
 * GoPay notification endpoint.
 *
 * Protected by GOPAY_WEBHOOK_SECRET — GoPay must call us with either
 *   ?secret=<value>  or  header  X-Faktero-GoPay-Secret: <value>
 *
 * GoPay sends a GET (sometimes POST) request with `id` query param.
 * We re-fetch the payment from GoPay server-side — we never trust the
 * payload. Idempotent via unique (provider, provider_payment_id).
 * Returns 401 on bad/missing secret, 500 on provider failures (so GoPay
 * retries), 200 only after a successful processing pass.
 */
export const Route = createFileRoute("/api/webhooks/gopay")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Best-effort in-memory rate limit (per Worker isolate). 30 req / 60s / IP.
const RL_MAX = 30;
const RL_WINDOW_MS = 60_000;
const rlBuckets = new Map<string, number[]>();
function rateLimitCheck(ip: string): boolean {
  const now = Date.now();
  const arr = (rlBuckets.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  arr.push(now);
  rlBuckets.set(ip, arr);
  if (rlBuckets.size > 1000) {
    // basic cleanup
    for (const [k, v] of rlBuckets) {
      if (!v.length || now - v[v.length - 1] > RL_WINDOW_MS) rlBuckets.delete(k);
    }
  }
  return arr.length <= RL_MAX;
}
function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ??
    "unknown"
  );
}

async function handle(request: Request): Promise<Response> {
  // 0. Rate limit before any work (cheap DoS guard).
  const ip = clientIp(request);
  if (!rateLimitCheck(ip)) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("billing_events").insert({
        company_id: null,
        event_type: "gopay_webhook_rate_limited",
        payload: { ip, limit: RL_MAX, window_ms: RL_WINDOW_MS },
      });
    } catch { /* ignore */ }
    return new Response("rate limited", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  // 1. Extract payment id first — GoPay sends GET ?id=<paymentId>&parent_id=<goid>
  const url = new URL(request.url);
  let paymentId = url.searchParams.get("id");
  if (!paymentId && request.method === "POST") {
    const ct = request.headers.get("content-type") ?? "";
    try {
      if (ct.includes("application/json")) {
        const body = await request.json();
        paymentId = body?.id ? String(body.id) : null;
      } else if (ct.includes("application/x-www-form-urlencoded")) {
        const text = await request.text();
        const params = new URLSearchParams(text);
        paymentId = params.get("id");
      }
    } catch { /* ignore */ }
  }
  if (!paymentId) {
    return new Response("missing id", { status: 400 });
  }

  // 2. Optional shared-secret check. GoPay itself does NOT send a secret —
  // this only guards manual re-triggers. If configured AND provided, verify.
  // Never 500 on a real GoPay notification just because the secret is unset.
  const expected = process.env.GOPAY_WEBHOOK_SECRET;
  const provided =
    url.searchParams.get("secret") ??
    request.headers.get("x-faktero-gopay-secret") ??
    "";
  if (expected && provided && !timingSafeEqualStr(provided, expected)) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!expected) {
    console.warn("[gopay-webhook] GOPAY_WEBHOOK_SECRET not configured — accepting notification without secret verification");
  }

  // 3. Acknowledge to GoPay immediately, process asynchronously.
  // GoPay retries on non-2xx, so we must always return 200 for a valid id.
  const pid = paymentId;
  Promise.resolve().then(() => processGopayPayment(pid)).catch(async (e) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("billing_events").insert({
        company_id: null,
        event_type: "gopay_webhook_async_error",
        payload: { id: pid, error: String(e?.message ?? e) },
      });
    } catch { /* ignore */ }
  });
  return new Response("ok", { status: 200 });
}

async function processGopayPayment(paymentId: string): Promise<void> {
  try {

    const { gopayGetPayment } = await import("@/lib/faktero/gopay.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payment = await gopayGetPayment(paymentId);
    const state = String(payment.state ?? "");

    // Find pending row created during checkout to recover company_id
    const { data: existing } = await supabaseAdmin
      .from("billing_payments")
      .select("id, company_id, plan_slug, status")
      .eq("provider", "gopay")
      .eq("provider_payment_id", String(payment.id))
      .maybeSingle();

    if (!existing) {
      // Unknown payment — log event and exit 200 so GoPay stops retrying
      await supabaseAdmin.from("billing_events").insert({
        company_id: null,
        event_type: "gopay_unknown_payment",
        payload: { id: String(payment.id), state },
      });
      return new Response("unknown", { status: 200 });
    }

    const isPaid = state === "PAID";
    const paidAt = isPaid ? new Date().toISOString() : null;

    await supabaseAdmin
      .from("billing_payments")
      .update({
        status: state,
        paid_at: paidAt,
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
      event_type: `gopay_${state.toLowerCase() || "unknown"}`,
      payload: { id: String(payment.id), state, amount: payment.amount },
    });

    // Vystaviť daňový doklad Tobify s.r.o. + poslať aktivačný email.
    // Idempotentné podľa billing_payment_id.
    if (isPaid) {
      try {
        const { issueSubscriptionInvoiceForPayment } = await import(
          "@/lib/faktero/subscription-invoice.server"
        );
        await issueSubscriptionInvoiceForPayment(existing.id);
      } catch (e: any) {
        await supabaseAdmin.from("billing_events").insert({
          company_id: existing.company_id,
          event_type: "platform_invoice_error",
          payload: { error: String(e?.message ?? e), source: "webhook" } as any,
        });
      }
    }

    return new Response("ok", { status: 200 });
  } catch (e: any) {
    // Provider/internal failure — log and return 500 so GoPay retries.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("billing_events").insert({
        company_id: null,
        event_type: "gopay_webhook_error",
        payload: { error: String(e?.message ?? e) },
      });
    } catch { /* ignore */ }
    return new Response("error", { status: 500 });
  }
}