import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHmac } from "crypto";

export type FakteroEvent =
  | "invoice.created"
  | "invoice.sent"
  | "invoice.paid"
  | "invoice.cancelled"
  | "customer.created"
  | "efaktura.received";

const RETRY_DELAYS_MS = [0, 1500, 4000];

function sign(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

async function deliverOne(opts: {
  url: string;
  secret: string | null;
  event: FakteroEvent;
  body: string;
}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-faktero-event": opts.event,
    "user-agent": "Faktero-Webhooks/1.0",
  };
  if (opts.secret) headers["x-faktero-signature"] = sign(opts.secret, opts.body);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(opts.url, { method: "POST", headers, body: opts.body, signal: ctrl.signal });
    const text = await res.text().catch(() => "");
    return { status: res.status, body: text.slice(0, 2000), ok: res.ok };
  } finally {
    clearTimeout(t);
  }
}

export async function triggerEvent(opts: {
  company_id: string;
  event: FakteroEvent;
  data: Record<string, any>;
}) {
  const { data: hooks } = await supabaseAdmin
    .from("webhooks")
    .select("id, url, secret, events, active")
    .eq("company_id", opts.company_id);
  // Fire-and-forget push notifikácia (samostatne od webhookov)
  try {
    const { sendPush } = await import("./push.server");
    if (opts.event === "invoice.paid") {
      const inv = opts.data as any;
      await sendPush({
        company_id: opts.company_id,
        title: "Faktúra zaplatená 💰",
        body: `Faktúra ${inv.invoice_number ?? ""} bola označená ako uhradená.`,
        data: { path: `/faktury/${inv.id}`, invoice_id: String(inv.id ?? "") },
      });
    } else if (opts.event === "efaktura.received") {
      const d = opts.data as any;
      await sendPush({
        company_id: opts.company_id,
        title: "Nová eFaktúra 📄",
        body: `Prijatá eFaktúra od ${d.supplier_name ?? "dodávateľa"}.`,
        data: { path: `/efaktura/prijate`, doc_id: String(d.id ?? "") },
      });
    }
  } catch (e) {
    console.warn("[push] send failed:", e);
  }

  if (!hooks?.length) return;

  const payload = {
    event: opts.event,
    created_at: new Date().toISOString(),
    data: opts.data,
  };
  const body = JSON.stringify(payload);

  const tasks = hooks
    .filter((h: any) => h.active && (h.events?.includes(opts.event) || h.events?.includes("*")))
    .map(async (h: any) => {
      const { data: logRow } = await supabaseAdmin
        .from("webhook_delivery_logs")
        .insert({
          company_id: opts.company_id,
          webhook_id: h.id,
          event_type: opts.event,
          payload,
          status: "pending",
          attempt_count: 0,
        })
        .select("id")
        .single();

      let lastStatus: number | null = null;
      let lastBody: string | null = null;
      let lastErr: string | null = null;
      let lastDuration: number | null = null;

      for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
        if (RETRY_DELAYS_MS[i]) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
        const t0 = Date.now();
        try {
          const r = await deliverOne({ url: h.url, secret: h.secret, event: opts.event, body });
          lastDuration = Date.now() - t0;
          lastStatus = r.status;
          lastBody = r.body;
          if (r.ok) {
            await supabaseAdmin.from("webhook_delivery_logs").update({
              status: "success", response_status: r.status, response_body: r.body,
              attempt_count: i + 1, error_message: null, duration_ms: lastDuration,
            }).eq("id", logRow!.id);
            return;
          }
        } catch (e: any) {
          lastDuration = Date.now() - t0;
          lastErr = e?.message ?? "fetch_failed";
        }
      }
      await supabaseAdmin.from("webhook_delivery_logs").update({
        status: "failed", response_status: lastStatus, response_body: lastBody,
        attempt_count: RETRY_DELAYS_MS.length, error_message: lastErr, duration_ms: lastDuration,
      }).eq("id", logRow!.id);
    });

  // Fire-and-forget but don't lose errors silently
  await Promise.allSettled(tasks);
}

/** Build a standard invoice payload */
export function invoicePayload(inv: any) {
  return {
    invoice_id: inv.id,
    invoice_number: inv.invoice_number,
    status: inv.status,
    total: Number(inv.total),
    currency: inv.currency,
    external_id: inv.external_id ?? null,
    customer_id: inv.customer_id ?? null,
    customer_name: inv.customer_name,
    customer_email: inv.customer_email,
  };
}

export function customerPayload(cust: any) {
  return {
    customer_id: cust.id,
    name: cust.name,
    email: cust.email,
    ico: cust.ico,
    external_id: cust.external_id ?? null,
  };
}