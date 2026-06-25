/**
 * GoPay REST API client (server-only).
 * Docs: https://doc.gopay.com/
 *
 * Reads secrets from process.env inside each call. Never import this from
 * client code.
 */

type GoPayEnv = "sandbox" | "production";

function getConfig() {
  const clientId = process.env.GOPAY_CLIENT_ID;
  const clientSecret = process.env.GOPAY_CLIENT_SECRET;
  const goid = process.env.GOPAY_GOID;
  const env = (process.env.GOPAY_ENV ?? "sandbox").toLowerCase() as GoPayEnv;
  if (!clientId || !clientSecret || !goid) {
    throw new Error("GoPay credentials are not configured");
  }
  const baseUrl =
    env === "production"
      ? "https://gate.gopay.cz/api"
      : "https://gw.sandbox.gopay.com/api";
  return { clientId, clientSecret, goid, env, baseUrl };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(scope: "payment-create" | "payment-all" = "payment-all") {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) return cachedToken.token;
  const { clientId, clientSecret, baseUrl } = getConfig();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials", scope });
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
    throw new Error(`GoPay token failed: ${res.status} ${txt}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return cachedToken.token;
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
  const { goid, baseUrl } = getConfig();
  const token = await getToken("payment-create");
  const body = {
    payer: {
      default_payment_instrument: "PAYMENT_CARD",
      allowed_payment_instruments: ["PAYMENT_CARD", "BANK_ACCOUNT"],
      contact: {
        email: input.payerEmail,
        ...(input.payerFullName ? { first_name: input.payerFullName.split(" ")[0], last_name: input.payerFullName.split(" ").slice(1).join(" ") } : {}),
      },
    },
    amount: input.amountCents,
    currency: input.currency ?? "EUR",
    order_number: input.orderNumber,
    order_description: input.orderDescription,
    callback: {
      return_url: input.returnUrl,
      notification_url: input.notifyUrl,
    },
    lang: input.lang ?? "SK",
    target: { type: "ACCOUNT", goid: Number(goid) },
  };
  const res = await fetch(`${baseUrl}/payments/payment`, {
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
  const { baseUrl } = getConfig();
  const token = await getToken("payment-all");
  const res = await fetch(`${baseUrl}/payments/payment/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GoPay get payment failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as GoPayPayment;
}

export function gopayEnv(): GoPayEnv {
  return (process.env.GOPAY_ENV ?? "sandbox").toLowerCase() as GoPayEnv;
}