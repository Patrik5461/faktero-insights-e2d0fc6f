import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ApiCtx = {
  supabase: typeof supabaseAdmin;
  company_id: string;
  /** Kľúč účtu (viac firiem) — firma prišla z hlavičky X-Company alebo ?company=. */
  ucet: boolean;
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
      "access-control-allow-headers": "authorization, content-type, x-company",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    },
  });
}

type RiadokKluca = {
  id: string;
  company_id: string;
  ucet_user_id?: string | null;
  firmy?: string[] | null;
};

export type FirmaKluca = {
  id: string;
  name: string;
  ico: string | null;
  ic_dph: string | null;
  country: string | null;
};

/**
 * Firmy, ku ktorým kľúč smie. Kľúč firmy = jedna firma. Kľúč účtu = firmy,
 * kde je jeho majiteľ vlastník alebo admin (správa API je len pre nich),
 * prípadne zúžené zoznamom `firmy`.
 */
export async function firmyKluca(k: RiadokKluca): Promise<FirmaKluca[]> {
  if (!k.ucet_user_id) {
    const { data } = await supabaseAdmin
      .from("companies")
      .select("id, name, ico, ic_dph, country")
      .eq("id", k.company_id)
      .maybeSingle();
    return data ? [data as FirmaKluca] : [];
  }
  const { data: clen } = await supabaseAdmin
    .from("company_users")
    .select("company_id")
    .eq("user_id", k.ucet_user_id)
    .in("role", ["owner", "admin"]);
  let ids = ((clen ?? []) as any[]).map((r) => String(r.company_id));
  if (Array.isArray(k.firmy) && k.firmy.length) ids = ids.filter((id) => k.firmy!.includes(id));
  if (!ids.length) return [];
  const { data } = await supabaseAdmin
    .from("companies")
    .select("id, name, ico, ic_dph, country")
    .in("id", ids)
    .order("name");
  return (data ?? []) as FirmaKluca[];
}

/** Firma z požiadavky: hlavička X-Company alebo ?company= (UUID alebo IČO). */
export function firmaZPoziadavky(request: Request): string | null {
  const h = request.headers.get("x-company")?.trim();
  if (h) return h;
  const q = new URL(request.url).searchParams.get("company")?.trim();
  return q || null;
}

export type VyberFirmy =
  | { ok: true; company_id: string; ucet: boolean }
  | { ok: false; status: number; code: string; message: string; firmy?: FirmaKluca[] };

/**
 * Vyberie firmu požiadavky. Kľúč firmy ide vždy na svoju firmu (iná v
 * hlavičke je chyba). Kľúč účtu potrebuje firmu z požiadavky — okrem
 * prípadu, keď smie len k jednej.
 */
export async function vyberFirmu(k: RiadokKluca, request: Request): Promise<VyberFirmy> {
  const ziadana = firmaZPoziadavky(request);
  const ico = (v: string) => v.replace(/\s/g, "");
  if (!k.ucet_user_id) {
    if (ziadana && ziadana !== k.company_id) {
      const firmy = await firmyKluca(k);
      if (!firmy.some((f) => f.id === ziadana || (f.ico && ico(f.ico) === ico(ziadana))))
        return {
          ok: false,
          status: 403,
          code: "company_forbidden",
          message: "Tento kľúč patrí inej firme.",
        };
    }
    return { ok: true, company_id: k.company_id, ucet: false };
  }
  const firmy = await firmyKluca(k);
  if (!firmy.length)
    return {
      ok: false,
      status: 403,
      code: "no_companies",
      message: "Kľúč účtu už nemá prístup k žiadnej firme.",
    };
  if (!ziadana) {
    if (firmy.length === 1) return { ok: true, company_id: firmy[0].id, ucet: true };
    return {
      ok: false,
      status: 400,
      code: "company_required",
      message:
        "Kľúč účtu platí pre viac firiem — uveďte firmu v hlavičke X-Company (id alebo IČO). Zoznam: GET /api/v1/companies.",
      firmy,
    };
  }
  const f = firmy.find((x) => x.id === ziadana || (x.ico && ico(x.ico) === ico(ziadana)));
  if (!f)
    return {
      ok: false,
      status: 403,
      code: "company_forbidden",
      message: "K tejto firme kľúč nemá prístup (musíte byť jej vlastník alebo admin).",
    };
  return { ok: true, company_id: f.id, ucet: true };
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
    .select("id, company_id, mode, revoked_at, expires_at, ucet_user_id, firmy")
    .eq("key_hash", key_hash)
    .maybeSingle();

  // Token z OAuth (MCP) má dobu platnosti; obyčajný API kľúč ju nemá.
  const vyprsal = (k: { expires_at?: string | null } | null) =>
    !!k?.expires_at && Date.parse(k.expires_at) <= Date.now();
  if (!keyRow || keyRow.revoked_at || vyprsal(keyRow as any)) {
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

  /*
    Testovací kľúč smie len čítať. Dokumentácia sľubovala „bez právnych
    účinkov“, no test aj live kľúč zapisovali rovnako ostré doklady (a
    odosielali ich zákazníkom). Kým nie je samostatné pieskovisko, zápis ide
    len cez live kľúč.
  */
  if (keyRow.mode === "test" && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const body = {
      error: {
        code: "test_key_read_only",
        message: "Testovací kľúč smie len čítať. Na vytváranie a zmeny použite live kľúč.",
      },
    };
    await logRequest({
      company_id: keyRow.company_id,
      api_key_id: keyRow.id,
      method,
      path,
      status: 403,
      requestBody,
      responseBody: body,
      userAgent,
      ip,
      duration: Date.now() - started,
    });
    return jsonResp(403, body);
  }

  /*
    Firma požiadavky. Zoznam firiem kľúča (/api/v1/companies) ju nepotrebuje;
    ostatné endpointy dostanú v ctx.company_id tú vybranú.
  */
  let firmaPoziadavky = keyRow.company_id;
  let jeUcet = false;
  // Pod /api/v1/companies je firma v adrese (alebo žiadna) — z hlavičky sa nevyberá.
  if (!/^\/api\/v1\/companies(\/|$)/.test(path)) {
    const v = await vyberFirmu(keyRow as RiadokKluca, request);
    if (!v.ok) {
      const body = {
        error: {
          code: v.code,
          message: v.message,
          ...(v.firmy
            ? {
                details: {
                  companies: v.firmy.map((f) => ({ id: f.id, name: f.name, ico: f.ico })),
                },
              }
            : {}),
        },
      };
      await logRequest({
        company_id: keyRow.company_id,
        api_key_id: keyRow.id,
        method,
        path,
        status: v.status,
        requestBody,
        responseBody: body,
        userAgent,
        ip,
        duration: Date.now() - started,
      });
      return jsonResp(v.status, body);
    }
    firmaPoziadavky = v.company_id;
    jeUcet = v.ucet;
  } else {
    jeUcet = Boolean((keyRow as any).ucet_user_id);
  }

  /*
    Počet požiadaviek sa zámerne neobmedzuje (rozhodnutie 2026-10-28): prenos
    tisícok dokladov narážal na limit 300 / 5 min a skript časť nepreniesol.
    Ochranu pred zahltením necháva na serveri (nginx), nie na kľúči.
  */
  let result: { status: number; body: any };
  try {
    result = await fn({
      supabase: supabaseAdmin,
      company_id: firmaPoziadavky,
      ucet: jeUcet,
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
    company_id: firmaPoziadavky,
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
      request_body: skratDoDennika(p.requestBody),
      response_body: skratDoDennika(p.responseBody),
      user_agent: p.userAgent,
      ip: p.ip,
      duration_ms: p.duration,
    });
  } catch (e) {
    console.error("[api-log]", e);
  }
}

/**
 * Úspešné volanie konektora Pohody do denníka. Z neho sa berie „kedy sa firma
 * naposledy ozvala“ — `last_used_at` kľúča nestačí, keď jeden kľúč obsluhuje
 * viac firiem.
 */
export async function zapisVolanieKonektora(
  kluc: { company_id: string; api_key_id: string },
  request: Request,
  status: number,
) {
  await logRequest({
    company_id: kluc.company_id,
    api_key_id: kluc.api_key_id,
    method: request.method,
    path: new URL(request.url).pathname,
    status,
    requestBody: null,
    responseBody: null,
    userAgent: request.headers.get("user-agent"),
    ip: null,
    duration: 0,
  });
}

/**
 * Do denníka nejde obsah súborov (base64) ani obrovské telá — nahratý doklad by
 * inak v `api_logs` ležal celý a zbytočne druhýkrát.
 */
export function skratDoDennika(telo: any): any {
  if (telo === null || telo === undefined) return telo;
  const nahrad = (v: any): any => {
    if (typeof v === "string")
      return v.length > 2000 ? `${v.slice(0, 200)}… (${v.length} znakov vynechaných)` : v;
    if (Array.isArray(v)) return v.slice(0, 200).map(nahrad);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [
          k,
          /base64|content$/i.test(k) && typeof x === "string" ? `(${x.length} znakov)` : nahrad(x),
        ]),
      );
    return v;
  };
  return nahrad(telo);
}

/**
 * Overí Bearer kľúč a vráti firmu, ktorej patrí.
 *
 * `handleApi` odpovedá vždy JSONom; konektor do Pohody potrebuje vrátiť surové
 * XML a prijať ho, preto si autentifikáciu volá takto samostatne.
 */
export async function overApiKluc(
  request: Request,
  volby: { bezFirmy?: boolean } = {},
): Promise<{
  company_id: string;
  api_key_id: string;
  mode: "test" | "live";
  /** Kľúč účtu — firmy, ku ktorým smie (pri `bezFirmy` sa firma nevyberá). */
  ucet: boolean;
  firmy: FirmaKluca[];
} | null> {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const key_hash = await sha256Hex(auth.slice(7).trim());

  const { data } = await supabaseAdmin
    .from("api_keys")
    .select("id, company_id, mode, revoked_at, expires_at, ucet_user_id, firmy")
    .eq("key_hash", key_hash)
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  if ((data as any).expires_at && Date.parse((data as any).expires_at) <= Date.now()) return null;
  const ucet = Boolean((data as any).ucet_user_id);
  let companyId = data.company_id;
  if (!volby.bezFirmy) {
    const v = await vyberFirmu(data as RiadokKluca, request);
    if (!v.ok) return null;
    companyId = v.company_id;
  }

  void supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    company_id: companyId,
    api_key_id: data.id,
    mode: data.mode as "test" | "live",
    ucet,
    firmy: ucet ? await firmyKluca(data as RiadokKluca) : [],
  };
}

/**
 * GET na endpoint, ktorý ho nemá. Bez neho TanStack vrátil HTML stránku so
 * stavom 200 — integrátor s nesprávnou metódou si myslel, že všetko prešlo.
 */
export function metodaNepovolena(povolene: string) {
  return new Response(
    JSON.stringify({
      error: {
        code: "method_not_allowed",
        message: `Tento koncový bod prijíma len ${povolene}.`,
      },
    }),
    {
      status: 405,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        allow: `${povolene}, OPTIONS`,
      },
    },
  );
}

export function ok(body: any, status = 200) {
  return { status, body };
}
export function err(code: string, message: string, status = 400, extra?: any) {
  return { status, body: { error: { code, message, ...(extra ? { details: extra } : {}) } } };
}
