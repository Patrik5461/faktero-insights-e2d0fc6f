/**
 * Google Search Console + Google Analytics 4 API client.
 * OAuth 2.0 refresh-token flow. Tokens stored encrypted (payment-crypto).
 * Server-only.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { encryptSecret, decryptSecret } from "./payment-crypto.server";

export const GSC_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/indexing",
].join(" ");

export const GA4_SCOPES = "https://www.googleapis.com/auth/analytics.readonly";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

export function getRedirectUri(): string {
  return process.env.GOOGLE_SEO_REDIRECT_URI ?? "https://www.faktero.sk/api/admin/seo/callback";
}

// -------- State signing (CSRF + carries type) --------

function stateKey(): string {
  return (
    process.env.PAYMENT_SECRETS_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "faktero-google-seo-state"
  );
}

export function signState(type: "gsc" | "ga4"): string {
  const payload = `${type}.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`;
  const mac = createHmac("sha256", stateKey()).update(payload).digest("hex").slice(0, 32);
  return Buffer.from(`${payload}.${mac}`).toString("base64url");
}

export function verifyState(state: string): { type: "gsc" | "ga4" } {
  let raw: string;
  try {
    raw = Buffer.from(state, "base64url").toString("utf8");
  } catch {
    throw new Error("Invalid state");
  }
  const parts = raw.split(".");
  if (parts.length !== 4) throw new Error("Invalid state");
  const [type, ts, nonce, mac] = parts;
  const expected = createHmac("sha256", stateKey())
    .update(`${type}.${ts}.${nonce}`)
    .digest("hex")
    .slice(0, 32);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid state signature");
  if (type !== "gsc" && type !== "ga4") throw new Error("Invalid state type");
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) throw new Error("State expired");
  return { type };
}

// -------- OAuth URLs --------

export function buildAuthorizeUrl(type: "gsc" | "ga4"): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_SEO_CLIENT_ID"),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: type === "gsc" ? GSC_SCOPES : GA4_SCOPES,
    state: signState(type),
  });
  return `${AUTH_URL}?${params.toString()}`;
}

// -------- Token exchange & refresh --------

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForToken(code: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: requireEnv("GOOGLE_SEO_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_SEO_CLIENT_SECRET"),
    redirect_uri: getRedirectUri(),
    grant_type: "authorization_code",
  });
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok)
    throw new Error(`Google token exchange failed: ${resp.status} ${await resp.text()}`);
  return (await resp.json()) as GoogleTokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: requireEnv("GOOGLE_SEO_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_SEO_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) throw new Error(`Google token refresh failed: ${resp.status} ${await resp.text()}`);
  return (await resp.json()) as GoogleTokenResponse;
}

// -------- Admin DB access via service role --------

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function saveConnection(params: {
  type: "gsc" | "ga4";
  token: GoogleTokenResponse;
  connectedBy?: string | null;
  propertyId?: string | null;
}): Promise<void> {
  const supabase = await admin();
  const expiresAt = new Date(Date.now() + params.token.expires_in * 1000).toISOString();
  const row: any = {
    type: params.type,
    access_token_enc: encryptSecret(params.token.access_token),
    scope: params.token.scope,
    expires_at: expiresAt,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (params.token.refresh_token) row.refresh_token_enc = encryptSecret(params.token.refresh_token);
  if (params.connectedBy) row.connected_by = params.connectedBy;
  if (params.propertyId !== undefined) row.property_id = params.propertyId;

  const { data: existing } = await supabase
    .from("google_seo_connections" as any)
    .select("id, refresh_token_enc")
    .eq("type", params.type)
    .maybeSingle();

  if (existing) {
    // never overwrite refresh_token with empty on refresh cycles
    if (!row.refresh_token_enc) delete row.refresh_token_enc;
    const { error } = await supabase
      .from("google_seo_connections" as any)
      .update(row)
      .eq("id", (existing as any).id);
    if (error) throw error;
  } else {
    if (!row.refresh_token_enc)
      throw new Error("Missing refresh_token from Google (re-consent required)");
    const { error } = await supabase.from("google_seo_connections" as any).insert(row);
    if (error) throw error;
  }
}

export async function getConnection(type: "gsc" | "ga4"): Promise<any | null> {
  const supabase = await admin();
  const { data } = await supabase
    .from("google_seo_connections" as any)
    .select("*")
    .eq("type", type)
    .maybeSingle();
  return (data as any) ?? null;
}

/**
 * Return a valid access token, refreshing if expired (30s safety margin).
 */
export async function getAccessToken(type: "gsc" | "ga4"): Promise<string> {
  const conn = await getConnection(type);
  if (!conn) throw new Error(`Google ${type.toUpperCase()} not connected`);

  const exp = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
  if (conn.access_token_enc && exp - Date.now() > 30_000) {
    return decryptSecret(conn.access_token_enc);
  }

  const refresh = decryptSecret(conn.refresh_token_enc);
  const token = await refreshAccessToken(refresh);
  await saveConnection({ type, token });
  return token.access_token;
}

// -------- Cache --------

export async function getCached<T>(key: string): Promise<T | null> {
  const supabase = await admin();
  const { data } = await supabase
    .from("seo_cache" as any)
    .select("data, expires_at")
    .eq("cache_key", key)
    .maybeSingle();
  if (!data) return null;
  if (new Date((data as any).expires_at).getTime() < Date.now()) return null;
  return (data as any).data as T;
}

export async function setCached(key: string, value: unknown, ttlSeconds = 3600): Promise<void> {
  const supabase = await admin();
  await supabase.from("seo_cache" as any).upsert(
    {
      cache_key: key,
      data: value as any,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    },
    { onConflict: "cache_key" },
  );
}

export async function invalidateCache(prefix: string): Promise<void> {
  const supabase = await admin();
  await supabase
    .from("seo_cache" as any)
    .delete()
    .like("cache_key", `${prefix}%`);
}

// -------- Google Search Console API --------

async function gscFetch(path: string, init: RequestInit = {}): Promise<any> {
  const token = await getAccessToken("gsc");
  const resp = await fetch(`https://searchconsole.googleapis.com${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!resp.ok) throw new Error(`GSC ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function listGscSites(): Promise<Array<{ siteUrl: string; permissionLevel: string }>> {
  const out = await gscFetch("/webmasters/v3/sites");
  return (out.siteEntry ?? []) as any[];
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function gscOverview(siteUrl: string) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 28);

  const encSite = encodeURIComponent(siteUrl);
  const base = { startDate: fmt(start), endDate: fmt(end), rowLimit: 10 };

  const [byQuery, byPage, byDate] = await Promise.all([
    gscFetch(`/webmasters/v3/sites/${encSite}/searchAnalytics/query`, {
      method: "POST",
      body: JSON.stringify({ ...base, dimensions: ["query"] }),
    }),
    gscFetch(`/webmasters/v3/sites/${encSite}/searchAnalytics/query`, {
      method: "POST",
      body: JSON.stringify({ ...base, dimensions: ["page"] }),
    }),
    gscFetch(`/webmasters/v3/sites/${encSite}/searchAnalytics/query`, {
      method: "POST",
      body: JSON.stringify({ ...base, dimensions: ["date"], rowLimit: 28 }),
    }),
  ]);

  const totals = (byDate.rows ?? []).reduce(
    (acc: any, r: any) => {
      acc.clicks += r.clicks ?? 0;
      acc.impressions += r.impressions ?? 0;
      return acc;
    },
    { clicks: 0, impressions: 0 },
  );
  const avgCtr = totals.impressions ? totals.clicks / totals.impressions : 0;
  const avgPos =
    (byDate.rows ?? []).reduce((s: number, r: any) => s + (r.position ?? 0), 0) /
    Math.max(1, (byDate.rows ?? []).length);

  return {
    site: siteUrl,
    totals: { ...totals, avgCtr, avgPos },
    topQueries: (byQuery.rows ?? []).map((r: any) => ({
      query: r.keys?.[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    })),
    topPages: (byPage.rows ?? []).map((r: any) => ({
      page: r.keys?.[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    })),
    daily: (byDate.rows ?? []).map((r: any) => ({
      date: r.keys?.[0],
      clicks: r.clicks,
      impressions: r.impressions,
    })),
  };
}

export async function urlInspect(siteUrl: string, url: string) {
  return gscFetch("/v1/urlInspection/index:inspect", {
    method: "POST",
    body: JSON.stringify({ siteUrl, inspectionUrl: url, languageCode: "sk-SK" }),
  });
}

export async function requestIndexing(url: string): Promise<any> {
  const token = await getAccessToken("gsc");
  const resp = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, type: "URL_UPDATED" }),
  });
  if (!resp.ok) throw new Error(`Indexing API ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// -------- Google Analytics 4 (Data API) --------

async function ga4Fetch(propertyId: string, body: any): Promise<any> {
  const token = await getAccessToken("ga4");
  const resp = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) throw new Error(`GA4 ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function listGa4Properties(): Promise<Array<{ name: string; displayName: string }>> {
  const token = await getAccessToken("ga4");
  // Admin API — list accounts, then property summaries
  const resp = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`GA4 Admin ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  const props: Array<{ name: string; displayName: string }> = [];
  for (const acc of json.accountSummaries ?? []) {
    for (const p of acc.propertySummaries ?? []) {
      props.push({
        name: p.property, // "properties/123456789"
        displayName: `${acc.displayName} / ${p.displayName}`,
      });
    }
  }
  return props;
}

export async function ga4Overview(propertyId: string) {
  const [core, sources, pages, daily, conversions] = await Promise.all([
    ga4Fetch(propertyId, {
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
      ],
    }),
    ga4Fetch(propertyId, {
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    }),
    ga4Fetch(propertyId, {
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 10,
    }),
    ga4Fetch(propertyId, {
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    }),
    ga4Fetch(propertyId, {
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          inListFilter: { values: ["sign_up", "purchase", "generate_lead"] },
        },
      },
    }),
  ]);

  const coreRow = core.rows?.[0]?.metricValues ?? [];
  return {
    property: propertyId,
    totals: {
      activeUsers: Number(coreRow[0]?.value ?? 0),
      sessions: Number(coreRow[1]?.value ?? 0),
      bounceRate: Number(coreRow[2]?.value ?? 0),
      avgDuration: Number(coreRow[3]?.value ?? 0),
    },
    topSources: (sources.rows ?? []).map((r: any) => ({
      source: r.dimensionValues?.[0]?.value,
      sessions: Number(r.metricValues?.[0]?.value ?? 0),
    })),
    topPages: (pages.rows ?? []).map((r: any) => ({
      page: r.dimensionValues?.[0]?.value,
      views: Number(r.metricValues?.[0]?.value ?? 0),
    })),
    daily: (daily.rows ?? []).map((r: any) => ({
      date: r.dimensionValues?.[0]?.value,
      activeUsers: Number(r.metricValues?.[0]?.value ?? 0),
      sessions: Number(r.metricValues?.[1]?.value ?? 0),
    })),
    conversions: (conversions.rows ?? []).map((r: any) => ({
      event: r.dimensionValues?.[0]?.value,
      count: Number(r.metricValues?.[0]?.value ?? 0),
    })),
  };
}
