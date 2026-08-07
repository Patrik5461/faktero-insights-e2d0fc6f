import { createHash } from "node:crypto";

/**
 * Tatra banka Premium API — Accounts v3.2.1
 * Read-only integration. OAuth2 confidential client + PKCE.
 *
 * Flow (overené priamo proti TB 2026-08-06):
 *   1. client_credentials token so scope=PREMIUM_AIS
 *   2. POST /v3/consents s tým tokenom → consentId
 *   3. redirect používateľa na /auth/oauth/v2/authorize so scope=PREMIUM_AIS:<consentId> + PKCE
 *   4. authorization_code + code_verifier → používateľský access_token
 *   5. GET /v3/accounts, GET /v5/accounts/<id>/transactions
 *
 * Pozor: base MUSÍ obsahovať /premium/. Cesta api.tatrabanka.sk/auth/oauth/v2
 * je PSD2 gateway — vyžaduje mTLS a Premium klienta nepozná.
 */

// TB_ENV=sandbox (default) → https://api.tatrabanka.sk/premium/sandbox
// TB_ENV=production        → https://api.tatrabanka.sk/premium/production
function tbBase(): string {
  const env = (process.env.TB_ENV ?? "sandbox").toLowerCase();
  return env === "production" || env === "prod"
    ? "https://api.tatrabanka.sk/premium/production"
    : "https://api.tatrabanka.sk/premium/sandbox";
}
function authBase(): string {
  return `${tbBase()}/auth/oauth/v2`;
}
// Verzia je súčasťou cesty zdroja (/v3/accounts, /v5/.../transactions),
// nie spoločným prefixom — preto tu žiadne /api/v1.
function apiBase(): string {
  return tbBase();
}

// AIS scope je pevný reťazec, NIE TB_SCOPE z env. TB má klientovi registrované
// PREMIUM_AIS, PREMIUM_PIS aj PREMIUM_PIS_CANC, ale authorize prijme naraz len
// jeden a pri AIS ho chce v tvare "PREMIUM_AIS:<consentId>" — čokoľvek iné
// (vrátane holého "PREMIUM_AIS") padne na invalid_scope.
const AIS_SCOPE = "PREMIUM_AIS";

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

/** PKCE pár. Verifier si musí volajúci odložiť — spotrebuje sa až pri výmene kódu. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = createHash("sha256").update(verifier).digest();
  return { verifier, challenge: base64Url(digest) };
}

function base64Url(buf: Uint8Array | Buffer): string {
  return Buffer.from(buf).toString("base64url");
}

/**
 * Servisný token (grant_type=client_credentials). Neslúži na čítanie dát —
 * /v3/accounts ho odmietne s TOKEN_INVALID — iba na správu consentov.
 */
export async function getClientCredentialsToken(): Promise<string> {
  const res = await fetch(`${authBase()}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(),
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: AIS_SCOPE }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`tb_client_credentials_failed: ${res.status} ${txt.slice(0, 300)}`);
  return JSON.parse(txt).access_token as string;
}

/**
 * Založí nový consent a vráti jeho id. Consent ide do scope authorize URL.
 *
 * combinedServiceIndicator sa dá nastaviť LEN pri vzniku súhlasu a TB ho
 * odporúča zapnúť, ak sa plánujú platby z účtov v iných bankách. Doplniť ho
 * neskôr by znamenalo, že každý zákazník musí súhlas udeliť odznova, preto ho
 * dávame rovno — PREMIUM_PIS máme od banky zaregistrované.
 */
export async function createConsent(): Promise<string> {
  const token = await getClientCredentialsToken();
  const res = await fetch(`${apiBase()}/v3/consents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Request-ID": crypto.randomUUID(),
    },
    body: JSON.stringify({ combinedServiceIndicator: true }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`tb_consent_failed: ${res.status} ${txt.slice(0, 300)}`);
  const consentId = JSON.parse(txt).consentId;
  if (!consentId) throw new Error(`tb_consent_missing_id: ${txt.slice(0, 200)}`);
  return consentId as string;
}

export function buildAuthorizeUrl(opts: {
  state: string;
  redirectUri: string;
  consentId: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.TB_CLIENT_ID!,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    // Bez consentId vráti TB invalid_scope, bez PKCE invalid_request.
    scope: `${AIS_SCOPE}:${opts.consentId}`,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  });
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

export async function exchangeCodeForToken(
  code: string,
  redirectUri?: string,
  codeVerifier?: string,
): Promise<TokenResponse> {
  // ALWAYS use the canonical redirect_uri from env — must match buildAuthorizeUrl()
  // exactly (byte-for-byte), otherwise TB returns 400 invalid_redirect_uri.
  const canonical = getRedirectUri(redirectUri);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: canonical,
  });
  // PKCE: authorize prebehol s code_challenge, token teda musí niesť verifier.
  if (codeVerifier) body.set("code_verifier", codeVerifier);
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
  // `path` môže byť aj absolútna URL (odkaz na ďalšiu stranu z _links.next).
  const url = path.startsWith("http") ? path : `${apiBase()}${path}`;
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
    console.error(
      `[tatrabanka] ${res.status} ${res.statusText} for ${url} — body: ${txt.slice(0, 300)}`,
    );
    throw new Error(`tb_api_error: ${res.status} ${url} ${txt.slice(0, 500)}`);
  }
  return JSON.parse(txt);
}

/**
 * Zruší súhlas na strane banky. Volá sa pri odpojení účtu — bez toho zostáva
 * súhlas v TB naďalej platný, aj keď ho v aplikácii už nemáme.
 * Autorizuje sa servisným (client_credentials) tokenom, nie tokenom používateľa.
 */
export async function revokeConsent(consentId: string): Promise<void> {
  const token = await getClientCredentialsToken();
  const res = await fetch(`${apiBase()}/v1/consents/${encodeURIComponent(consentId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "X-Request-ID": crypto.randomUUID(),
    },
  });
  // 204 = zrušené. 404 znamená, že už neexistuje — pre nás rovnako dobré.
  if (!res.ok && res.status !== 404) {
    throw new Error(`tb_consent_revoke_failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

/**
 * Vynúti obnovu dát pre účty vedené mimo TB. Účty v TB sú vždy aktuálne, ostatné
 * banka obnovuje sama 4× denne (7-9, 13-15, 17-19, 22-24).
 *
 * Beží asynchrónne — vráti taskId a dáta doraz o chvíľu, takže hneď nasledujúce
 * čítanie ešte môže vrátiť staré hodnoty. Volať najviac raz za 30 s, častejšie
 * požiadavky banka ignoruje. PSU-IP-Address je povinná, user agent a OS sú
 * povinné pre VÚB, ČSOB a RBSK — preto to má zmysel len pri akcii používateľa.
 */
export async function refreshExternalBanks(
  accessToken: string,
  psu: { ip?: string | null; userAgent?: string | null; deviceOs?: string | null },
): Promise<string | null> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "X-Request-ID": crypto.randomUUID(),
  };
  if (psu.ip) headers["PSU-IP-Address"] = psu.ip;
  if (psu.userAgent) headers["PSU-User-Agent"] = psu.userAgent;
  if (psu.deviceOs) headers["PSU-Device-OS"] = psu.deviceOs;

  const res = await fetch(`${apiBase()}/v3/refresh`, { method: "PUT", headers });
  const txt = await res.text();
  if (!res.ok) {
    // Obnova je len vylepšenie — keď zlyhá, synchronizácia musí bežať ďalej.
    console.error(`[tatrabanka] refresh zlyhal: ${res.status} ${txt.slice(0, 200)}`);
    return null;
  }
  try {
    return JSON.parse(txt).taskId ?? null;
  } catch {
    return null;
  }
}

export type TbAccount = {
  external_account_id: string;
  iban: string | null;
  account_name: string | null;
  currency: string;
  balance: number;
};

export async function fetchAccounts(
  accessToken: string,
  consentId?: string | null,
): Promise<TbAccount[]> {
  // withBalance=true — bez neho nie je zaručené, že TB zostatky vôbec pošle.
  const json = await apiGet("/v3/accounts?withBalance=true", accessToken, consentId);
  const accounts: any[] = json.accounts ?? json.Accounts ?? [];
  return accounts.map((a: any) => {
    const balances: any[] = a.balances ?? [];
    const closing =
      balances.find((b) => /closing|interim|expected/i.test(b.balanceType ?? "")) ?? balances[0];
    const amt = closing?.balanceAmount?.amount ?? closing?.amount ?? 0;
    // Accounts v3 nesie IBAN a menu v accountReference, nie na koreni objektu.
    const ref = a.accountReference ?? {};
    return {
      external_account_id: a.accountId ?? a.resourceId ?? a.id ?? ref.iban ?? a.iban,
      iban: ref.iban ?? a.iban ?? null,
      account_name: a.displayName ?? a.name ?? a.product ?? a.ownerName ?? null,
      currency: ref.currency ?? a.currency ?? closing?.balanceAmount?.currency ?? "EUR",
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
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - daysBack);
  const fromStr = dateFrom.toISOString().slice(0, 10);

  // Transakcie sú v5 (účty v3). `dateTo` sa pri dopyte na aktuálne transakcie
  // podľa dokumentácie nevypĺňa. `page` funguje len pre účty mimo TB, preto ho
  // neposielame — stránkuje sa nasledovaním odkazu _links.next, ktorý si už
  // správnu formu (page alebo entryReferenceFrom) nesie sám.
  let next: string | null =
    `/v5/accounts/${encodeURIComponent(externalAccountId)}/transactions?dateFrom=${fromStr}&pageSize=200`;

  const booked: any[] = [];
  // Poistka proti nekonečnej slučke, keby banka vracala next donekonečna.
  for (let page = 0; next && page < 25; page++) {
    const json = await apiGet(next, accessToken, consentId);
    const batch: any[] = json.transactions?.booked ?? json.booked ?? json.transactions ?? [];
    booked.push(...batch);
    const href = json._links?.next?.href;
    next =
      href && batch.length > 0
        ? String(href)
            .replace(/&&/g, "&")
            .replace(/['"]+$/, "")
        : null;
  }
  // Nezaúčtované transakcie sa v čase ešte menia (aj ich id), takže by sme si
  // nimi zaniesli duplicity. Berieme len BOOKED; ak stav nepríde, berieme tiež.
  const settled = booked.filter(
    (t: any) => !t.transactionState || /booked/i.test(t.transactionState),
  );

  return settled.map((t: any) => {
    const amt = Number(t.transactionAmount?.amount ?? t.amount ?? 0);
    const cur = t.transactionAmount?.currency ?? t.currency ?? "EUR";
    const vs =
      t.remittanceInformationStructured?.variableSymbol ??
      t.variableSymbol ??
      extractVS(t.remittanceInformationUnstructured ?? "");
    const counter = t.creditorName ?? t.debtorName ?? t.counterPartyName ?? null;
    return {
      transaction_reference: t.transactionId ?? t.entryReference ?? null,
      booking_date: (t.bookingDate ?? t.valueDate ?? new Date().toISOString()).slice(0, 10),
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
  invoices: Array<{
    id: string;
    invoice_number: string;
    total: number;
    variable_symbol?: string | null;
  }>,
): string | null {
  if (tx.variable_symbol) {
    const byVs = invoices.find(
      (i) => i.variable_symbol && i.variable_symbol === tx.variable_symbol,
    );
    if (byVs) return byVs.id;
  }
  const desc = tx.description ?? "";
  const byNum = invoices.find((i) => i.invoice_number && desc.includes(i.invoice_number));
  if (byNum) return byNum.id;
  const byAmt = invoices.find((i) => Math.abs(Number(i.total) - tx.amount) < 0.005);
  if (byAmt) return byAmt.id;
  return null;
}

/**
 * Zapíše účty z banky k pripojeniu bez toho, aby vznikli duplikáty.
 *
 * Páruje sa **podľa IBAN**, nie podľa `external_account_id`: identita účtu je
 * IBAN, kým `accountId` je viazané na súhlas a po jeho obnove sa môže zmeniť.
 * Keby sa páralo podľa neho, po obnove súhlasu by vznikli druhé kópie účtov
 * a transakcie aj výpisy by ostali visieť na tých starých.
 */
export async function upsertBankAccounts(
  companyId: string,
  connectionId: string,
  accounts: Array<{
    external_account_id: string;
    iban: string | null;
    account_name: string | null;
    currency: string;
    balance: number;
  }>,
): Promise<{ updated: number; inserted: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: known } = await supabaseAdmin
    .from("bank_accounts")
    .select("id, iban, external_account_id")
    .eq("bank_connection_id", connectionId);

  let updated = 0;
  let inserted = 0;
  for (const a of accounts) {
    const match =
      (a.iban && known?.find((k: any) => k.iban && k.iban === a.iban)) ||
      known?.find((k: any) => k.external_account_id === a.external_account_id);
    const values = {
      external_account_id: a.external_account_id,
      iban: a.iban,
      account_name: a.account_name,
      currency: a.currency,
      balance: a.balance,
      last_synced_at: new Date().toISOString(),
    };
    if (match) {
      await supabaseAdmin
        .from("bank_accounts")
        .update(values)
        .eq("id", (match as any).id);
      updated++;
    } else {
      await supabaseAdmin
        .from("bank_accounts")
        .insert({ company_id: companyId, bank_connection_id: connectionId, ...values });
      inserted++;
    }
  }
  return { updated, inserted };
}
