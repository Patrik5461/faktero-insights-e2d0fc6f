/**
 * GoPay client that uses MERCHANT (per-company) credentials, not
 * Faktero's platform billing credentials.
 * Server-only.
 */
type GoPayEnv = "sandbox" | "production";

export type MerchantCreds = {
  goid: string;
  clientId: string;
  clientSecret: string;
  sandbox: boolean;
};

function baseUrl(sandbox: boolean) {
  return sandbox ? "https://gw.sandbox.gopay.com/api" : "https://gate.gopay.cz/api";
}

async function getToken(
  creds: MerchantCreds,
  scope: "payment-create" | "payment-all" = "payment-all",
) {
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials", scope });
  const res = await fetch(`${baseUrl(creds.sandbox)}/oauth2/token`, {
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
    throw new Error(`GoPay token failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export async function merchantTestConnection(creds: MerchantCreds): Promise<void> {
  await getToken(creds, "payment-all");
}

export type MerchantCreatePaymentInput = {
  amountCents: number;
  currency?: string;
  orderNumber: string;
  orderDescription: string;
  returnUrl: string;
  notifyUrl: string;
  payerEmail?: string;
  lang?: "SK" | "CS" | "EN";
};

export type MerchantPayment = {
  id: number | string;
  state: string;
  amount: number;
  currency: string;
  gw_url?: string;
};

export async function merchantCreatePayment(
  creds: MerchantCreds,
  input: MerchantCreatePaymentInput,
): Promise<MerchantPayment> {
  const token = await getToken(creds, "payment-create");
  const body = {
    payer: {
      default_payment_instrument: "PAYMENT_CARD",
      allowed_payment_instruments: ["PAYMENT_CARD", "BANK_ACCOUNT"],
      ...(input.payerEmail ? { contact: { email: input.payerEmail } } : {}),
    },
    amount: input.amountCents,
    currency: input.currency ?? "EUR",
    order_number: input.orderNumber,
    order_description: input.orderDescription,
    callback: { return_url: input.returnUrl, notification_url: input.notifyUrl },
    lang: input.lang ?? "SK",
    target: { type: "ACCOUNT", goid: Number(creds.goid) },
  };
  const res = await fetch(`${baseUrl(creds.sandbox)}/payments/payment`, {
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
    throw new Error(`GoPay create payment failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as MerchantPayment;
}

export async function merchantGetPayment(
  creds: MerchantCreds,
  id: string | number,
): Promise<MerchantPayment> {
  const token = await getToken(creds, "payment-all");
  const res = await fetch(`${baseUrl(creds.sandbox)}/payments/payment/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GoPay get payment failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as MerchantPayment;
}
