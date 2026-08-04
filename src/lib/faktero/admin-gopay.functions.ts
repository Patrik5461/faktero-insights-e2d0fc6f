import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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

type StoredGopay = {
  env?: string;
  goid?: string;
  client_id_enc?: string;
  client_secret_enc?: string;
  webhook_secret_enc?: string;
};

async function readStored(supabaseAdmin: any): Promise<StoredGopay | null> {
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("value, updated_at")
    .eq("key", "gopay")
    .maybeSingle();
  return data?.value ?? null;
}

export const getPlatformGopayStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const stored = await readStored(supabaseAdmin);

    const { decryptSecret } = await import("@/lib/faktero/payment-crypto.server");
    const safeDecrypt = (v?: string | null) => {
      if (!v) return null;
      try {
        return decryptSecret(v);
      } catch {
        return null;
      }
    };

    // Resolve effective config (DB overrides env per-field)
    const env = (stored?.env ?? process.env.GOPAY_ENV ?? "sandbox").toLowerCase();
    const goid = stored?.goid ?? process.env.GOPAY_GOID ?? null;
    const clientId = safeDecrypt(stored?.client_id_enc) ?? process.env.GOPAY_CLIENT_ID ?? null;
    const clientSecret =
      safeDecrypt(stored?.client_secret_enc) ?? process.env.GOPAY_CLIENT_SECRET ?? null;
    const webhookSecret =
      safeDecrypt(stored?.webhook_secret_enc) ?? process.env.GOPAY_WEBHOOK_SECRET ?? null;
    const appUrl = process.env.APP_PUBLIC_URL ?? null;

    const sourceOf = (dbVal: unknown, envVal: unknown) =>
      dbVal ? "db" : envVal ? "env" : "missing";

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
      else if (s === "failed" || s === "cancelled" || s === "canceled" || s === "timeouted")
        counts.failed++;
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
        clientSecretMasked: mask(clientSecret, 0),
        webhookSecretMasked: mask(webhookSecret, 0),
        webhookUrl: appUrl ? `${appUrl.replace(/\/$/, "")}/api/webhooks/gopay` : null,
        sources: {
          env: stored?.env ? "db" : process.env.GOPAY_ENV ? "env" : "default",
          goid: sourceOf(stored?.goid, process.env.GOPAY_GOID),
          clientId: sourceOf(stored?.client_id_enc, process.env.GOPAY_CLIENT_ID),
          clientSecret: sourceOf(stored?.client_secret_enc, process.env.GOPAY_CLIENT_SECRET),
          webhookSecret: sourceOf(stored?.webhook_secret_enc, process.env.GOPAY_WEBHOOK_SECRET),
        },
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

const SaveSchema = z.object({
  env: z.enum(["sandbox", "production"]),
  goid: z.string().trim().min(3).max(40),
  // empty string => keep existing
  clientId: z.string().max(200).optional().default(""),
  clientSecret: z.string().max(500).optional().default(""),
  webhookSecret: z.string().max(500).optional().default(""),
});

export const savePlatformGopaySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { encryptSecret } = await import("@/lib/faktero/payment-crypto.server");
    const stored = (await readStored(supabaseAdmin)) ?? {};

    const newClientId = data.clientId.trim();
    if (!newClientId && !stored.client_id_enc && !process.env.GOPAY_CLIENT_ID) {
      throw new Error("Client ID je povinné.");
    }

    const next: StoredGopay = {
      env: data.env,
      goid: data.goid.trim(),
      client_id_enc: newClientId
        ? encryptSecret(newClientId)
        : (stored.client_id_enc ??
          (process.env.GOPAY_CLIENT_ID ? encryptSecret(process.env.GOPAY_CLIENT_ID) : undefined)),
      client_secret_enc:
        data.clientSecret && data.clientSecret.length > 0
          ? encryptSecret(data.clientSecret)
          : (stored.client_secret_enc ??
            (process.env.GOPAY_CLIENT_SECRET
              ? encryptSecret(process.env.GOPAY_CLIENT_SECRET)
              : undefined)),
      webhook_secret_enc:
        data.webhookSecret && data.webhookSecret.length > 0
          ? encryptSecret(data.webhookSecret)
          : (stored.webhook_secret_enc ??
            (process.env.GOPAY_WEBHOOK_SECRET
              ? encryptSecret(process.env.GOPAY_WEBHOOK_SECRET)
              : undefined)),
    };

    const { error } = await supabaseAdmin.from("platform_settings").upsert({
      key: "gopay",
      value: next,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    if (error) throw new Error(error.message);

    const { invalidateGopayTokenCache } = await import("@/lib/faktero/gopay.server");
    invalidateGopayTokenCache();

    return { ok: true };
  });

export const clearPlatformGopaySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    await supabaseAdmin.from("platform_settings").delete().eq("key", "gopay");
    const { invalidateGopayTokenCache } = await import("@/lib/faktero/gopay.server");
    invalidateGopayTokenCache();
    return { ok: true };
  });

export const testPlatformGopayConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { loadPlatformGopayConfig, invalidateGopayTokenCache } =
      await import("@/lib/faktero/gopay.server");
    invalidateGopayTokenCache();
    const cfg = await loadPlatformGopayConfig();
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
    const body = new URLSearchParams({ grant_type: "client_credentials", scope: "payment-all" });
    const res = await fetch(`${cfg.baseUrl}/oauth2/token`, {
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
      throw new Error(`GoPay token zlyhal (${res.status}): ${txt.slice(0, 300)}`);
    }
    const json = (await res.json()) as { expires_in?: number };
    return {
      ok: true,
      env: cfg.env,
      expiresInSec: json.expires_in ?? null,
      testedAt: new Date().toISOString(),
    };
  });
