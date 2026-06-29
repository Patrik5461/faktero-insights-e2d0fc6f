import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function mask(v?: string | null, keep = 3) {
  if (!v) return null;
  if (v.length <= keep + 1) return "•••";
  return v.slice(0, keep) + "•••" + v.slice(-2);
}

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: admin } = await supabaseAdmin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!admin) throw new Error("Forbidden");
  return supabaseAdmin;
}

export const getPlatformGopayStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);

    const clientId = process.env.GOPAY_CLIENT_ID ?? null;
    const clientSecret = process.env.GOPAY_CLIENT_SECRET ?? null;
    const goid = process.env.GOPAY_GOID ?? null;
    const env = (process.env.GOPAY_ENV ?? "sandbox").toLowerCase();
    const webhookSecret = process.env.GOPAY_WEBHOOK_SECRET ?? null;
    const appUrl = process.env.APP_PUBLIC_URL ?? null;

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: payments } = await supabaseAdmin
      .from("billing_payments")
      .select("status, amount_cents, currency, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20);

    const counts = { paid: 0, pending: 0, failed: 0, other: 0 };
    let totalPaidCents = 0;
    (payments ?? []).forEach((p: any) => {
      const s = String(p.status ?? "").toLowerCase();
      if (s === "paid" || s === "succeeded") {
        counts.paid++;
        totalPaidCents += Number(p.amount_cents ?? 0);
      } else if (s === "pending" || s === "created" || s === "authorized") counts.pending++;
      else if (s === "failed" || s === "cancelled" || s === "canceled" || s === "timeouted") counts.failed++;
      else counts.other++;
    });

    return {
      config: {
        env,
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        hasGoid: !!goid,
        hasWebhookSecret: !!webhookSecret,
        hasAppUrl: !!appUrl,
        goid,
        clientIdMasked: mask(clientId, 4),
        webhookUrl: appUrl ? `${appUrl.replace(/\/$/, "")}/api/webhooks/gopay` : null,
      },
      payments30d: {
        ...counts,
        total: (payments ?? []).length,
        totalPaidCents,
      },
      recent: (payments ?? []).slice(0, 10).map((p: any) => ({
        status: p.status,
        amountCents: p.amount_cents,
        currency: p.currency,
        createdAt: p.created_at,
      })),
    };
  });

export const testPlatformGopayConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const clientId = process.env.GOPAY_CLIENT_ID;
    const clientSecret = process.env.GOPAY_CLIENT_SECRET;
    const goid = process.env.GOPAY_GOID;
    const env = (process.env.GOPAY_ENV ?? "sandbox").toLowerCase();
    if (!clientId || !clientSecret || !goid) {
      throw new Error("Chýbajú GOPAY_CLIENT_ID / GOPAY_CLIENT_SECRET / GOPAY_GOID.");
    }
    const baseUrl =
      env === "production"
        ? "https://gate.gopay.cz/api"
        : "https://gw.sandbox.gopay.com/api";
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const body = new URLSearchParams({ grant_type: "client_credentials", scope: "payment-all" });
    const res = await fetch(`${baseUrl}/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`GoPay token zlyhal (${res.status}): ${txt.slice(0, 200)}`);
    }
    const json = (await res.json()) as { expires_in?: number };
    return { ok: true, env, expiresInSec: json.expires_in ?? null, testedAt: new Date().toISOString() };
  });
