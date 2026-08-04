import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const IdInput = z.object({ id: z.string().uuid() });

/** Retry a single webhook delivery. Creates a new log row to preserve history. */
export const retryWebhookDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    // Use the user-scoped client so RLS verifies access to this log row.
    const { data: log, error } = await context.supabase
      .from("webhook_delivery_logs")
      .select("id, company_id, webhook_id, event_type, payload")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !log) throw new Error("Záznam nenájdený");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: hook } = await supabaseAdmin
      .from("webhooks")
      .select("id, url, secret, active")
      .eq("id", log.webhook_id)
      .maybeSingle();
    if (!hook) throw new Error("Webhook už neexistuje");

    const { createHmac } = await import("crypto");
    const body = JSON.stringify(log.payload);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-faktero-event": log.event_type as string,
      "user-agent": "Faktero-Webhooks/1.0",
      "x-faktero-retry": "1",
    };
    if (hook.secret) {
      headers["x-faktero-signature"] = createHmac("sha256", hook.secret).update(body).digest("hex");
    }

    const t0 = Date.now();
    let response_status: number | null = null;
    let response_body: string | null = null;
    let status: "success" | "failed" = "failed";
    let error_message: string | null = null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch(hook.url, { method: "POST", headers, body, signal: ctrl.signal });
      const text = await res.text().catch(() => "");
      response_status = res.status;
      response_body = text.slice(0, 2000);
      status = res.ok ? "success" : "failed";
      if (!res.ok) error_message = `HTTP ${res.status}`;
    } catch (e: any) {
      error_message = e?.message ?? "fetch_failed";
    } finally {
      clearTimeout(timer);
    }
    const duration_ms = Date.now() - t0;

    const { data: inserted } = await supabaseAdmin
      .from("webhook_delivery_logs")
      .insert({
        company_id: log.company_id,
        webhook_id: hook.id,
        event_type: log.event_type,
        payload: log.payload,
        status,
        response_status,
        response_body,
        duration_ms,
        attempt_count: 1,
        error_message,
      })
      .select("id")
      .single();

    return { ok: status === "success", log_id: inserted?.id, response_status, duration_ms };
  });
