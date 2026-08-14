/**
 * Push notifikácie. iOS ide priamo cez APNs (appka registruje APNs token a nemá
 * v sebe Firebase), Android cez FCM. Podľa tvaru tokenu sa vyberie správna cesta,
 * takže volajúci nemusí vedieť platformu.
 *
 * Vyžadované secrety:
 *  - FCM_PROJECT_ID            (Firebase project id)
 *  - FCM_SERVICE_ACCOUNT_JSON  (JSON service account z Firebase Console → Project Settings → Service Accounts)
 *
 * Pre iOS FCM rieši APNs v zákulisí — netreba samostatný APNs klient,
 * stačí v Firebase Console nahrať APNs Auth Key (.p8) z Apple Developer.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type SendInput = {
  user_id?: string;
  company_id?: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

let cachedToken: { value: string; exp: number } | null = null;

function parseServiceAccount(): ServiceAccount {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FCM_SERVICE_ACCOUNT_JSON not set");
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) throw new Error("Invalid FCM service account");
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  return sa;
}

function base64UrlEncode(buf: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof buf === "string") bytes = new TextEncoder().encode(buf);
  else if (buf instanceof Uint8Array) bytes = buf;
  else bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const sa = parseServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64UrlEncode(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(jwt)}`,
  });
  if (!res.ok) throw new Error(`FCM oauth failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

async function sendToToken(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  const { jeApnsToken } = await import("./apns");
  if (jeApnsToken(token)) {
    const { jeApnsNastavene, posliCezApns } = await import("./apns.server");
    if (!jeApnsNastavene()) return { ok: false, status: 0, error: "APNs nie je nastavené" };
    const r = await posliCezApns(token, { title, body, data });
    // Token, ktorý Apple označí za mŕtvy, sa zahodí — appku už niekto odinštaloval.
    if (r.mrtvyToken) {
      await supabaseAdmin
        .from("profiles")
        .update({ push_token: null, push_platform: null } as any)
        .eq("push_token", token);
    }
    return r;
  }

  const projectId = process.env.FCM_PROJECT_ID;
  if (!projectId) throw new Error("FCM_PROJECT_ID not set");
  const accessToken = await getAccessToken();

  const message = {
    message: {
      token,
      notification: { title, body },
      data: data ?? {},
      apns: {
        payload: { aps: { sound: "default", badge: 1 } },
      },
      android: { priority: "HIGH" as const, notification: { sound: "default" } },
    },
  };

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const txt = await res.text();
    return { ok: false, status: res.status, error: txt };
  }
  return { ok: true };
}

export function isPushConfigured() {
  const fcm = Boolean(process.env.FCM_PROJECT_ID && process.env.FCM_SERVICE_ACCOUNT_JSON);
  const apns = Boolean(
    process.env.APNS_KEY_ID &&
      process.env.APNS_TEAM_ID &&
      process.env.APNS_PRIVATE_KEY &&
      process.env.APNS_BUNDLE_ID,
  );
  return fcm || apns;
}

/**
 * Odošle notifikáciu na hotový zoznam FCM tokenov.
 *
 * Určené pre dávkové odosielanie (cron hooky), kde sa príjemcovia vyhľadajú
 * jedným dotazom pre všetky firmy naraz namiesto dotazu na každú správu.
 */
export async function sendPushToTokens(
  tokens: string[],
  input: Omit<SendInput, "user_id" | "company_id">,
) {
  if (tokens.length === 0) return { ok: true, sent: 0, total: 0 };
  const results = await Promise.all(
    tokens.map((t) =>
      sendToToken(t, input.title, input.body, input.data).catch((e) => ({
        ok: false,
        error: e?.message,
      })),
    ),
  );
  return { ok: true, sent: results.filter((r) => r.ok).length, total: tokens.length };
}

export async function sendPush(input: SendInput) {
  if (!isPushConfigured()) {
    return { ok: false, skipped: true, reason: "Push nie je nastavený" };
  }

  let query = supabaseAdmin
    .from("profiles")
    .select("id, push_token, push_platform")
    .not("push_token", "is", null);

  if (input.user_id) {
    query = query.eq("id", input.user_id);
  } else if (input.company_id) {
    const { data: members } = await supabaseAdmin
      .from("company_users")
      .select("user_id")
      .eq("company_id", input.company_id);
    const ids = (members ?? []).map((m: any) => m.user_id);
    if (ids.length === 0) return { ok: true, sent: 0 };
    query = query.in("id", ids);
  } else {
    return { ok: false, error: "user_id or company_id required" };
  }

  const { data: targets } = await query;
  if (!targets || targets.length === 0) return { ok: true, sent: 0 };

  return sendPushToTokens(
    targets.map((t: any) => t.push_token as string),
    { title: input.title, body: input.body, data: input.data },
  );
}
