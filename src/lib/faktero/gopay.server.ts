/**
 * GoPay REST API client (server-only).
 * Docs: https://doc.gopay.com/
 *
 * Configuration priority:
 *   1. public.platform_settings row with key='gopay' (DB-stored, encrypted secrets)
 *   2. process.env GOPAY_* fallback
 *
 * Never import this from client code.
 */
import { decryptSecret } from "./payment-crypto.server";

type GoPayEnv = "sandbox" | "production";

type Config = {
  clientId: string;
  clientSecret: string;
  goid: string;
  env: GoPayEnv;
  webhookSecret: string | null;
  baseUrl: string;
  source: "db" | "env" | "mixed";
};

function baseUrlFor(env: GoPayEnv): string {
  return env === "production" ? "https://gate.gopay.cz/api" : "https://gw.sandbox.gopay.com/api";
}

export async function loadPlatformGopayConfig(): Promise<Config> {
  // Try DB first
  let dbCfg: {
    env?: string;
    goid?: string;
    client_id_enc?: string;
    client_secret_enc?: string;
    webhook_secret_enc?: string;
  } | null = null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("platform_settings")
      .select("value")
      .eq("key", "gopay")
      .maybeSingle();
    if (data && data.value && typeof data.value === "object") dbCfg = data.value as any;
  } catch {
    // ignore; will fall back to env
  }

  let source: "db" | "env" | "mixed" = "env";
  let clientId = process.env.GOPAY_CLIENT_ID ?? "";
  let clientSecret = process.env.GOPAY_CLIENT_SECRET ?? "";
  let goid = process.env.GOPAY_GOID ?? "";
  let env: GoPayEnv = (process.env.GOPAY_ENV ?? "sandbox").toLowerCase() as GoPayEnv;
  let webhookSecret: string | null = process.env.GOPAY_WEBHOOK_SECRET ?? null;

  if (dbCfg) {
    source = "db";
    if (dbCfg.env) env = dbCfg.env.toLowerCase() as GoPayEnv;
    if (dbCfg.goid) goid = dbCfg.goid;
    if (dbCfg.client_id_enc) {
      try {
        clientId = decryptSecret(dbCfg.client_id_enc);
      } catch {
        source = "mixed";
      }
    }
    if (dbCfg.client_secret_enc) {
      try {
        clientSecret = decryptSecret(dbCfg.client_secret_enc);
      } catch {
        source = "mixed";
      }
    }
    if (dbCfg.webhook_secret_enc) {
      try {
        webhookSecret = decryptSecret(dbCfg.webhook_secret_enc);
      } catch {
        /* keep env */
      }
    }
  }

  if (!clientId || !clientSecret || !goid) {
    throw new Error("GoPay credentials are not configured");
  }
  if (env !== "production" && env !== "sandbox") env = "sandbox";

  return { clientId, clientSecret, goid, env, webhookSecret, baseUrl: baseUrlFor(env), source };
}

let cachedToken: { token: string; expiresAt: number; key: string } | null = null;

async function getToken(scope: "payment-create" | "payment-all" = "payment-all") {
  const cfg = await loadPlatformGopayConfig();
  const cacheKey = `${cfg.env}:${cfg.clientId}:${scope}`;
  const now = Date.now();
  if (cachedToken && cachedToken.key === cacheKey && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.token;
  }
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials", scope });
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
    throw new Error(`GoPay token failed: ${res.status} ${txt}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
    key: cacheKey,
  };
  return cachedToken.token;
}

export function invalidateGopayTokenCache() {
  cachedToken = null;
}

export type GoPayCreatePaymentInput = {
  amountCents: number;
  currency?: string;
  orderNumber: string;
  orderDescription: string;
  returnUrl: string;
  notifyUrl: string;
  payerEmail: string;
  payerFullName?: string;
  lang?: "SK" | "CS" | "EN";
};

export type GoPayPayment = {
  id: number | string;
  state: string;
  amount: number;
  currency: string;
  order_number?: string;
  gw_url?: string;
  payer?: { contact?: { email?: string } };
};

export async function gopayCreatePayment(input: GoPayCreatePaymentInput): Promise<GoPayPayment> {
  const cfg = await loadPlatformGopayConfig();
  const token = await getToken("payment-create");
  const body = {
    payer: {
      default_payment_instrument: "PAYMENT_CARD",
      allowed_payment_instruments: ["PAYMENT_CARD", "BANK_ACCOUNT"],
      contact: {
        email: input.payerEmail,
        ...(input.payerFullName
          ? {
              first_name: input.payerFullName.split(" ")[0],
              last_name: input.payerFullName.split(" ").slice(1).join(" "),
            }
          : {}),
      },
    },
    amount: input.amountCents,
    currency: input.currency ?? "EUR",
    order_number: input.orderNumber,
    order_description: input.orderDescription,
    callback: { return_url: input.returnUrl, notification_url: input.notifyUrl },
    lang: input.lang ?? "SK",
    target: { type: "ACCOUNT", goid: Number(cfg.goid) },
  };
  const res = await fetch(`${cfg.baseUrl}/payments/payment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GoPay create payment failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as GoPayPayment;
}

export async function gopayGetPayment(id: string | number): Promise<GoPayPayment> {
  const cfg = await loadPlatformGopayConfig();
  const token = await getToken("payment-all");
  const res = await fetch(`${cfg.baseUrl}/payments/payment/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GoPay get payment failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as GoPayPayment;
}

export async function gopayEnv(): Promise<GoPayEnv> {
  try {
    const cfg = await loadPlatformGopayConfig();
    return cfg.env;
  } catch {
    return (process.env.GOPAY_ENV ?? "sandbox").toLowerCase() as GoPayEnv;
  }
}
