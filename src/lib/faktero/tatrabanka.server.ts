/**
 * Tatra banka Premium API — Accounts v3.2.1 (sandbox)
 * Read-only integration. OAuth2 confidential client flow.
 */

// Tatra banka Premium API / Open Banking AISP
// TB_ENV=sandbox (default) → https://api.tatrabanka.sk/sandbox/...
// TB_ENV=production        → https://api.tatrabanka.sk/...
//   authorize: <base>/auth/oauth/v2/authorize
//   token:     <base>/auth/oauth/v2/token
//   api base:  <base>/api/v1
function tbBase(): string {
  const env = (process.env.TB_ENV ?? "sandbox").toLowerCase();
  return env === "production" || env === "prod"
    ? "https://api.tatrabanka.sk"
    : "https://api.tatrabanka.sk/sandbox";
}
function authBase(): string { return `${tbBase()}/auth/oauth/v2`; }
function apiBase(): string { return `${tbBase()}/api/v1`; }

export function isTatraConfigured(): boolean {
  return !!process.env.TB_CLIENT_ID && !!process.env.TB_CLIENT_SECRET;
}

/**
 * Canonical OAuth redirect_uri. MUST be byte-for-byte identical between
 * buildAuthorizeUrl() and exchangeCodeForToken() — TB rejects any mismatch
 * with 400 invalid_redirect_uri.
 * Priority:
 *   1. TB_REDIRECT_URI       (explicit override, wins over everything)
 *   2. APP_PUBLIC_URL        (canonical public origin of the app)
 *   3. `origin` fallback     (only used when neither env is set)
 */
export function getRedirectUri(origin?: string): string {
  const explicit = process.env.TB_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const base = process.env.APP_PUBLIC_URL?.replace(/\/$/, "") ?? origin?.replace(/\/$/, "");
  if (!base) throw new Error("APP_PUBLIC_URL not configured");
  return `${base}/api/public/tatrabanka/callback`;
}

export function buildAuthorizeUrl(opts: { state: string; redirectUri: string }): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.TB_CLIENT_ID!,
    redirect_uri: opts.redirectUri,
    state: opts.state,
  });
  // Scope is required by TB — default to "AISP" when TB_SCOPE env is missing/empty.
  const scope = process.env.TB_SCOPE?.trim() || "AISP";
  params.set("scope", scope);
  return `${authBase()}/authorize?${params.toString()}`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  consent_id?: string;
};

function basicAuth(): string {
  const id = process.env.TB_CLIENT_ID!;
  const secret = process.env.TB_CLIENT_SECRET!;
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export async function exchangeCodeForToken(code: string, redirectUri?: string): Promise<TokenResponse> {
  // ALWAYS use the canonical redirect_uri from env — must match buildAuthorizeUrl()
  // exactly (byte-for-byte), otherwise TB returns 400 invalid_redirect_uri.
  const canonical = getRedirectUri(redirectUri);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: canonical,
  });
  const res = await fetch(`${authBase()}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(),
      Accept: "application/json",
    },
    body,
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`token_exchange_failed: ${res.status} ${txt}`);
  return JSON.parse(txt);
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(`${authBase()}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(),
      Accept: "application/json",
    },
    body,
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`token_refresh_failed: ${res.status} ${txt}`);
  return JSON.parse(txt);
}

async function apiGet(path: string, accessToken: string, _consentId?: string | null) {
  // TB Premium API grants consent implicitly via the OAuth access_token.
  // Do NOT send Consent-ID — it's a PSD2 XS2A header and returns 404 here.
  const url = `${apiBase()}${path}`;
  const requestId = crypto.randomUUID();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "X-Request-ID": requestId,
  };
  console.log(`[tatrabanka] GET ${url} (X-Request-ID=${requestId})`);
  const res = await fetch(url, { headers });
  const txt = await res.text();
  if (!res.ok) {
    console.error(`[tatrabanka] ${res.status} ${res.statusText} for ${url} — body: ${txt.slice(0, 300)}`);
    throw new Error(`tb_api_error: ${res.status} ${url} ${txt.slice(0, 500)}`);
  }
  return JSON.parse(txt);
}

export type TbAccount = {
  external_account_id: string;
  iban: string | null;
  account_name: string | null;
  currency: string;
  balance: number;
};

export async function fetchAccounts(accessToken: string, consentId?: string | null): Promise<TbAccount[]> {
  const json = await apiGet("/accounts", accessToken, consentId);
  const accounts: any[] = json.accounts ?? json.Accounts ?? [];
  return accounts.map((a: any) => {
    const balances: any[] = a.balances ?? [];
    const closing = balances.find((b) => /closing|interim|expected/i.test(b.balanceType ?? "")) ?? balances[0];
    const amt = closing?.balanceAmount?.amount ?? closing?.amount ?? 0;
    return {
      external_account_id: a.resourceId ?? a.accountId ?? a.id ?? a.iban,
      iban: a.iban ?? null,
      account_name: a.name ?? a.product ?? a.ownerName ?? null,
      currency: a.currency ?? closing?.balanceAmount?.currency ?? "EUR",
      balance: Number(amt) || 0,
    };
  });
}

export type TbTransaction = {
  transaction_reference: string | null;
  booking_date: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  variable_symbol: string | null;
  counterparty: string | null;
  description: string | null;
};

export async function fetchTransactions(
  accessToken: string,
  externalAccountId: string,
  consentId?: string | null,
  daysBack = 90,
): Promise<TbTransaction[]> {
  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - daysBack);
  const fromStr = dateFrom.toISOString().slice(0, 10);
  const toStr = dateTo.toISOString().slice(0, 10);
  const json = await apiGet(
    `/accounts/${encodeURIComponent(externalAccountId)}/transactions?bookingStatus=booked&dateFrom=${fromStr}&dateTo=${toStr}`,
    accessToken,
    consentId,
  );
  const booked: any[] = json.transactions?.booked ?? json.booked ?? json.transactions ?? [];
  return booked.map((t: any) => {
    const amt = Number(t.transactionAmount?.amount ?? t.amount ?? 0);
    const cur = t.transactionAmount?.currency ?? t.currency ?? "EUR";
    const vs =
      t.remittanceInformationStructured?.variableSymbol ??
      t.variableSymbol ??
      extractVS(t.remittanceInformationUnstructured ?? "");
    const counter =
      t.creditorName ?? t.debtorName ?? t.counterPartyName ?? null;
    return {
      transaction_reference: t.transactionId ?? t.entryReference ?? null,
      booking_date: (t.bookingDate ?? t.valueDate ?? toStr).slice(0, 10),
      amount: amt,
      currency: cur,
      variable_symbol: vs ? String(vs) : null,
      counterparty: counter,
      description: t.remittanceInformationUnstructured ?? t.additionalInformation ?? null,
    };
  });
}

function extractVS(text: string): string | null {
  const m = /VS[:\s]*([0-9]{1,10})/i.exec(text);
  return m ? m[1] : null;
}

/**
 * Suggest matching invoice for a transaction.
 * Rules (in order, do NOT auto-apply): variable symbol match, invoice number match, amount match.
 * Returns invoice id or null. Caller decides whether to persist.
 */
export function suggestMatch(
  tx: { amount: number; variable_symbol: string | null; description: string | null },
  invoices: Array<{ id: string; invoice_number: string; total: number; variable_symbol?: string | null }>,
): string | null {
  if (tx.variable_symbol) {
    const byVs = invoices.find((i) => i.variable_symbol && i.variable_symbol === tx.variable_symbol);
    if (byVs) return byVs.id;
  }
  const desc = tx.description ?? "";
  const byNum = invoices.find((i) => i.invoice_number && desc.includes(i.invoice_number));
  if (byNum) return byNum.id;
  const byAmt = invoices.find((i) => Math.abs(Number(i.total) - tx.amount) < 0.005);
  if (byAmt) return byAmt.id;
  return null;
}