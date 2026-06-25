import { createFileRoute } from "@tanstack/react-router";

/**
 * Per-merchant GoPay notification endpoint.
 * Authenticated by per-company webhook secret embedded in the notify URL:
 *   /api/public/webhooks/gopay-merchant?cid=<company_id>&s=<webhook_secret>&id=<payment_id>
 * We always re-fetch payment status from GoPay using the company's own credentials.
 */
export const Route = createFileRoute("/api/public/webhooks/gopay-merchant")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});

function eq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function handle(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const cid = url.searchParams.get("cid") ?? "";
    const secret = url.searchParams.get("s") ?? "";
    let paymentId = url.searchParams.get("id");
    if (!paymentId && request.method === "POST") {
      const ct = request.headers.get("content-type") ?? "";
      try {
        if (ct.includes("json")) { const b = await request.json(); paymentId = b?.id ? String(b.id) : null; }
        else { const t = await request.text(); paymentId = new URLSearchParams(t).get("id"); }
      } catch { /* ignore */ }
    }
    if (!cid || !secret || !paymentId) return new Response("missing params", { status: 400 });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptSecret } = await import("@/lib/faktero/payment-crypto.server");
    const { merchantGetPayment } = await import("@/lib/faktero/payments-gopay.server");

    const { data: prov } = await supabaseAdmin.from("company_payment_providers")
      .select("*").eq("company_id", cid).eq("provider", "gopay").maybeSingle();
    if (!prov || !prov.webhook_secret || !eq(prov.webhook_secret, secret)) {
      return new Response("unauthorized", { status: 401 });
    }
    if (!prov.encrypted_client_secret) return new Response("not configured", { status: 400 });

    const payment = await merchantGetPayment(
      { goid: prov.goid!, clientId: prov.client_id!, clientSecret: decryptSecret(prov.encrypted_client_secret), sandbox: prov.sandbox_mode },
      paymentId,
    );
    const state = String(payment.state ?? "");

    const { data: link } = await supabaseAdmin.from("invoice_payment_links")
      .select("*").eq("provider", "gopay").eq("provider_payment_id", String(payment.id)).maybeSingle();
    if (!link || link.company_id !== cid) {
      await supabaseAdmin.from("billing_events").insert({
        company_id: cid, event_type: "gopay_merchant_unknown_payment",
        payload: { id: String(payment.id), state } as any,
      });
      return new Response("unknown", { status: 200 });
    }

    const isPaid = state === "PAID";
    await supabaseAdmin.from("invoice_payment_links").update({
      status: isPaid ? "paid" : state.toLowerCase(),
      paid_at: isPaid ? new Date().toISOString() : null,
    }).eq("id", link.id);

    if (isPaid) {
      // mark invoice paid (only if not already)
      const { data: inv } = await supabaseAdmin.from("invoices")
        .select("id, status, total, currency").eq("id", link.invoice_id).maybeSingle();
      if (inv && inv.status !== "paid") {
        await supabaseAdmin.from("invoices").update({
          status: "paid", paid_at: new Date().toISOString(),
        }).eq("id", inv.id);
        await supabaseAdmin.from("payments").insert({
          company_id: cid, invoice_id: inv.id,
          amount: link.amount_cents / 100, currency: link.currency,
          payment_date: new Date().toISOString().slice(0, 10),
          method: "gopay", note: `GoPay payment ${payment.id}`,
        } as any);
        await supabaseAdmin.from("platform_audit_logs").insert({
          admin_user_id: link.created_by ?? "00000000-0000-0000-0000-000000000000",
          action: "invoice_paid_via_gopay",
          entity_type: "invoice", entity_id: inv.id,
          metadata: { payment_id: String(payment.id), amount_cents: link.amount_cents } as any,
        });
      }
    }

    await supabaseAdmin.from("billing_events").insert({
      company_id: cid, event_type: `gopay_merchant_${state.toLowerCase() || "unknown"}`,
      payload: { id: String(payment.id), state, invoice_id: link.invoice_id } as any,
    });

    return new Response("ok", { status: 200 });
  } catch (e: any) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("billing_events").insert({
        company_id: null, event_type: "gopay_merchant_webhook_error",
        payload: { error: String(e?.message ?? e) } as any,
      });
    } catch { /* ignore */ }
    return new Response("error", { status: 500 });
  }
}