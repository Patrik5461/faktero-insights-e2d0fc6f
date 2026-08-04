import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ApiCtx = {
  supabase: typeof supabaseAdmin;
  company_id: string;
  api_key_id: string;
  mode: "test" | "live";
  request: Request;
  requestBody: any;
  userAgent: string | null;
  ip: string | null;
};

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResp(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    },
  });
}

export async function handleApi(
  request: Request,
  fn: (ctx: ApiCtx) => Promise<{ status: number; body: any }>,
): Promise<Response> {
  const started = Date.now();
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === "OPTIONS") return jsonResp(204, {});

  const userAgent = request.headers.get("user-agent");
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;

  // Parse body (best effort)
  let requestBody: any = null;
  if (method !== "GET" && method !== "DELETE") {
    try {
      const text = await request.text();
      if (text) requestBody = JSON.parse(text);
    } catch {
      return jsonResp(400, {
        error: { code: "invalid_json", message: "Telo požiadavky musí byť platný JSON." },
      });
    }
  }

  // Bearer auth
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    const r = jsonResp(401, {
      error: { code: "missing_api_key", message: "Chýba Bearer API kľúč." },
    });
    await logRequest({
      company_id: null,
      api_key_id: null,
      method,
      path,
      status: 401,
      requestBody,
      responseBody: null,
      userAgent,
      ip,
      duration: Date.now() - started,
    });
    return r;
  }
  const token = auth.slice(7).trim();
  const key_hash = await sha256Hex(token);

  const { data: keyRow } = await supabaseAdmin
    .from("api_keys")
    .select("id, company_id, mode, revoked_at")
    .eq("key_hash", key_hash)
    .maybeSingle();

  if (!keyRow || keyRow.revoked_at) {
    const r = jsonResp(401, {
      error: { code: "invalid_api_key", message: "API kľúč je neplatný alebo zneplatnený." },
    });
    await logRequest({
      company_id: null,
      api_key_id: null,
      method,
      path,
      status: 401,
      requestBody,
      responseBody: null,
      userAgent,
      ip,
      duration: Date.now() - started,
    });
    return r;
  }

  // Rate limit: 300 requests / 5 min per API key (uses api_logs as the counter store)
  const windowStart = new Date(Date.now() - 5 * 60_000).toISOString();
  const { count: recentCount } = await supabaseAdmin
    .from("api_logs")
    .select("id", { count: "exact", head: true })
    .eq("api_key_id", keyRow.id)
    .gte("created_at", windowStart);
  if ((recentCount ?? 0) >= 300) {
    const retryAfterSec = 300; // 5-minute window
    const body = {
      error: {
        code: "rate_limit_exceeded",
        message: "Prekročili ste limit API požiadaviek (300 / 5 minút). Skúste to neskôr.",
      },
    };
    const r = new Response(JSON.stringify(body), {
      status: 429,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
        "retry-after": String(retryAfterSec),
        "x-ratelimit-limit": "300",
        "x-ratelimit-window": "300",
      },
    });
    await logRequest({
      company_id: keyRow.company_id,
      api_key_id: keyRow.id,
      method,
      path,
      status: 429,
      requestBody,
      responseBody: body,
      userAgent,
      ip,
      duration: Date.now() - started,
    });
    return r;
  }

  let result: { status: number; body: any };
  try {
    result = await fn({
      supabase: supabaseAdmin,
      company_id: keyRow.company_id,
      api_key_id: keyRow.id,
      mode: keyRow.mode as "test" | "live",
      request,
      requestBody,
      userAgent,
      ip,
    });
  } catch (e: any) {
    console.error("[api]", e);
    result = {
      status: 500,
      body: { error: { code: "internal_error", message: e?.message ?? "Interná chyba." } },
    };
  }

  // Fire-and-forget log + last_used_at
  void supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id);
  await logRequest({
    company_id: keyRow.company_id,
    api_key_id: keyRow.id,
    method,
    path,
    status: result.status,
    requestBody,
    responseBody: result.body,
    userAgent,
    ip,
    duration: Date.now() - started,
  });

  return jsonResp(result.status, result.body);
}

async function logRequest(p: {
  company_id: string | null;
  api_key_id: string | null;
  method: string;
  path: string;
  status: number;
  requestBody: any;
  responseBody: any;
  userAgent: string | null;
  ip: string | null;
  duration: number;
}) {
  try {
    await supabaseAdmin.from("api_logs").insert({
      company_id: p.company_id,
      api_key_id: p.api_key_id,
      method: p.method,
      path: p.path,
      status: p.status,
      request_body: p.requestBody,
      response_body: p.responseBody,
      user_agent: p.userAgent,
      ip: p.ip,
      duration_ms: p.duration,
    });
  } catch (e) {
    console.error("[api-log]", e);
  }
}

export function ok(body: any, status = 200) {
  return { status, body };
}
export function err(code: string, message: string, status = 400, extra?: any) {
  return { status, body: { error: { code, message, ...(extra ? { details: extra } : {}) } } };
}
