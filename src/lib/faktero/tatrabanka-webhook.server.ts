/**
 * Prijímač notifikácií od Tatra banky.
 *
 * POZOR — provizórny stav. Tatra banka nám zatiaľ nedodala dokumentáciu k formátu
 * notifikácií (aké hlavičky posiela, či a ako telo podpisuje, aká je štruktúra
 * payloadu). Preto tento handler notifikáciu **iba prijme, overí zdieľané tajomstvo
 * a uloží** — zámerne z nej nič neodvodzuje a nespúšťa žiadnu synchronizáciu.
 * Konať na základe neautentizovaného obsahu by bola diera; keď dorazí dokumentácia,
 * doplní sa overenie podpisu a spracovanie uložených záznamov.
 */

const MAX_BODY_BYTES = 64 * 1024;

/** Porovnanie odolné voči časovej analýze. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Hlavičky, ktoré má zmysel uchovať. Authorization ani cookie sa neukladajú. */
const KEEP_HEADERS = [
  "content-type",
  "user-agent",
  "x-request-id",
  "x-correlation-id",
  "x-tb-signature",
  "x-signature",
  "signature",
  "digest",
  "date",
];

function pickHeaders(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of KEEP_HEADERS) {
    const v = request.headers.get(name);
    if (v) out[name] = v.slice(0, 500);
  }
  return out;
}

function clientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim().slice(0, 64);
  return request.headers.get("x-real-ip")?.slice(0, 64) ?? null;
}

export async function handleTatraWebhook(request: Request, path: string): Promise<Response> {
  // Banka aj portál si endpoint overujú obyčajným GETom — nech vidia, že žije.
  if (request.method === "GET" || request.method === "HEAD") {
    return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  }
  if (request.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const secret = process.env.TB_WEBHOOK_SECRET?.trim();
  const url = new URL(request.url);
  const supplied = url.searchParams.get("s") ?? request.headers.get("x-webhook-secret") ?? "";

  if (secret) {
    if (!safeEqual(supplied, secret)) {
      console.warn(`[tatrabanka webhook] odmietnuté – nesedí tajomstvo (path=${path})`);
      return new Response("unauthorized", { status: 401 });
    }
  } else {
    // Bez nastaveného tajomstva by ktokoľvek na internete vedel plniť tabuľku.
    // Notifikáciu preto potvrdíme, ale neukladáme – len zalogujeme, že prišla.
    console.warn(
      `[tatrabanka webhook] TB_WEBHOOK_SECRET nie je nastavený – notifikácia prijatá a zahodená (path=${path})`,
    );
    return new Response("ok", { status: 200 });
  }

  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return new Response("bad body", { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    console.warn(`[tatrabanka webhook] telo príliš veľké (${raw.length} B), orezané`);
    raw = raw.slice(0, MAX_BODY_BYTES);
  }

  let payload: unknown = null;
  if ((request.headers.get("content-type") ?? "").includes("json")) {
    try {
      payload = JSON.parse(raw);
    } catch {
      // Neplatný JSON necháme len v raw_body, nie je to dôvod vrátiť chybu.
    }
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("bank_webhook_events").insert({
      provider: "tatrabanka",
      path,
      method: request.method,
      headers: pickHeaders(request),
      payload: payload as any,
      raw_body: raw || null,
      source_ip: clientIp(request),
    });
    if (error) throw new Error(error.message);
  } catch (e: any) {
    // Chybu zalogujeme, ale banke vrátime 200 — inak by notifikáciu donekonečna
    // opakovala kvôli našej internej chybe.
    console.error("[tatrabanka webhook] uloženie zlyhalo:", e?.message ?? e);
  }

  return new Response("ok", { status: 200 });
}
