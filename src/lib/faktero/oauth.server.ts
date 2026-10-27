/**
 * OAuth 2.1 pre MCP server — aby sa Faktero dalo pripojiť priamo v claude.ai,
 * ChatGPT a ďalších klientoch, ktoré API kľúč do hlavičky zadať nevedia.
 *
 * Tok podľa špecifikácie MCP (2025-06-18): klient z 401 na /api/mcp zistí
 * metadáta chráneného zdroja (RFC 9728) → autorizačného servera (RFC 8414) →
 * sám sa zaregistruje (RFC 7591) → pošle človeka na /oauth/authorize, kde sa
 * prihlási do Faktera, vyberie firmu a povolí prístup → kód vymení za token
 * (PKCE S256, povinné).
 *
 * Prístupový token je obyčajný API kľúč s dobou platnosti (`api_keys.expires_at`)
 * — /api/v1 aj /api/mcp ho overia rovnako a človek ho vidí v zozname API kľúčov,
 * kde ho môže zrušiť.
 */
import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ZAKLAD = (process.env.FAKTERO_PUBLIC_URL || "https://www.faktero.sk").replace(
  /\/$/,
  "",
);
export const MCP_ZDROJ = `${ZAKLAD}/api/mcp`;
export const SCOPE = "faktero";

const PLATNOST_KODU_S = 600;
const PLATNOST_TOKENU_S = 7 * 24 * 3600;
const PLATNOST_REFRESH_S = 90 * 24 * 3600;

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const nahodny = (bajtov = 32) => randomBytes(bajtov).toString("base64url");

export function metadataZdroja() {
  return {
    resource: MCP_ZDROJ,
    authorization_servers: [ZAKLAD],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Faktero",
    resource_documentation: `${ZAKLAD}/docs/api#mcp`,
  };
}

export function metadataServera() {
  return {
    issuer: ZAKLAD,
    authorization_endpoint: `${ZAKLAD}/oauth/authorize`,
    token_endpoint: `${ZAKLAD}/oauth/token`,
    registration_endpoint: `${ZAKLAD}/oauth/register`,
    revocation_endpoint: `${ZAKLAD}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
    service_documentation: `${ZAKLAD}/docs/api#mcp`,
  };
}

/** Povolené návratové adresy: https, alebo http len na vlastný počítač (desktopové klienty). */
export function platnaNavratovaAdresa(u: unknown): boolean {
  try {
    const url = new URL(String(u));
    if (url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

export class OAuthChyba extends Error {
  constructor(
    public kod: string,
    popis: string,
    public status = 400,
  ) {
    super(popis);
  }
}

/** Dynamická registrácia klienta (RFC 7591) — verejný klient bez tajomstva. */
/*
  Strop registrácií — /oauth/register je verejný (DCR). IP klienta za routerom
  nevidíme (všetko príde z jednej adresy), preto spoločný strop za hodinu.
*/
const STROP_REGISTRACII = 60;
let registracie: number[] = [];

export async function zaregistrujKlienta(telo: any) {
  const teraz = Date.now();
  registracie = registracie.filter((t) => teraz - t < 3_600_000);
  if (registracie.length >= STROP_REGISTRACII)
    throw new OAuthChyba(
      "temporarily_unavailable",
      "Priveľa registrácií, skúste to o chvíľu.",
      429,
    );
  registracie.push(teraz);
  const adresy: unknown[] = Array.isArray(telo?.redirect_uris) ? telo.redirect_uris : [];
  if (!adresy.length || adresy.length > 10 || !adresy.every(platnaNavratovaAdresa)) {
    throw new OAuthChyba(
      "invalid_redirect_uri",
      "redirect_uris musí byť zoznam adries https (alebo http://localhost).",
    );
  }
  const metoda = telo?.token_endpoint_auth_method ?? "none";
  if (metoda !== "none") {
    throw new OAuthChyba(
      "invalid_client_metadata",
      "Podporovaný je len verejný klient (token_endpoint_auth_method: none).",
    );
  }
  const clientId = `mcp_${nahodny(16)}`;
  const nazov = String(telo?.client_name ?? "").slice(0, 120) || null;
  const { error } = await supabaseAdmin
    .from("oauth_clients")
    .insert({ client_id: clientId, client_name: nazov, redirect_uris: adresy.map(String) });
  if (error) throw new OAuthChyba("server_error", error.message, 500);
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: nazov ?? undefined,
    redirect_uris: adresy,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: SCOPE,
  };
}

export type ZiadostOAuth = {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method?: string;
  response_type?: string;
  state?: string;
  scope?: string;
  resource?: string;
};

/** Overí žiadosť o prístup ešte pred tým, než ju človek uvidí — a znova pri schválení. */
export async function overZiadost(z: ZiadostOAuth) {
  if (z.response_type && z.response_type !== "code") {
    throw new OAuthChyba("unsupported_response_type", "Podporovaný je len response_type=code.");
  }
  const { data: klient } = await supabaseAdmin
    .from("oauth_clients")
    .select("client_id, client_name, redirect_uris")
    .eq("client_id", String(z.client_id ?? ""))
    .maybeSingle();
  if (!klient) throw new OAuthChyba("invalid_client", "Neznámy klient — zaregistrujte ho znova.");
  if (!(klient.redirect_uris as string[]).includes(String(z.redirect_uri ?? ""))) {
    throw new OAuthChyba(
      "invalid_request",
      "Návratová adresa nie je pri klientovi zaregistrovaná.",
    );
  }
  if (!z.code_challenge || (z.code_challenge_method ?? "S256") !== "S256") {
    throw new OAuthChyba("invalid_request", "Chýba PKCE (code_challenge s metódou S256).");
  }
  if (
    z.resource &&
    z.resource.replace(/\/$/, "") !== MCP_ZDROJ &&
    z.resource.replace(/\/$/, "") !== ZAKLAD
  ) {
    throw new OAuthChyba("invalid_target", "Neznámy zdroj (resource).");
  }
  return {
    klient: klient as { client_id: string; client_name: string | null; redirect_uris: string[] },
  };
}

/** Človek povolil prístup — vydá jednorazový kód a vráti adresu, kam ho poslať. */
/** Interná značka v rozsahu kódu a obnovy: prístup ku všetkým firmám používateľa. */
const SCOPE_UCET = `${SCOPE} ucet`;
const jeUcet = (scope: unknown) =>
  String(scope ?? "")
    .split(/\s+/)
    .includes("ucet");

export async function vydajKod(
  z: ZiadostOAuth,
  companyId: string,
  userId: string,
  /** Všetky firmy používateľa (kľúč účtu); `companyId` je potom len domovská firma. */
  ucet = false,
): Promise<string> {
  await overZiadost(z);
  const kod = nahodny(32);
  const { error } = await supabaseAdmin.from("oauth_codes").insert({
    code_hash: hash(kod),
    client_id: z.client_id,
    company_id: companyId,
    user_id: userId,
    redirect_uri: z.redirect_uri,
    code_challenge: z.code_challenge,
    scope: ucet ? SCOPE_UCET : SCOPE,
    expires_at: new Date(Date.now() + PLATNOST_KODU_S * 1000).toISOString(),
  });
  if (error) throw new OAuthChyba("server_error", error.message, 500);
  const url = new URL(z.redirect_uri);
  url.searchParams.set("code", kod);
  if (z.state) url.searchParams.set("state", z.state);
  url.searchParams.set("iss", ZAKLAD);
  return url.toString();
}

export function zamietnutie(z: ZiadostOAuth): string {
  const url = new URL(z.redirect_uri);
  url.searchParams.set("error", "access_denied");
  if (z.state) url.searchParams.set("state", z.state);
  return url.toString();
}

async function vydajTokeny(o: {
  clientId: string;
  companyId: string;
  userId: string;
  nazovKlienta: string | null;
  ucet?: boolean;
}) {
  const pristup = `fk_mcp_${nahodny(32)}`;
  const { data: kluc, error } = await supabaseAdmin
    .from("api_keys")
    .insert({
      company_id: o.companyId,
      mode: "live",
      name: `AI asistent (MCP)${o.nazovKlienta ? ` — ${o.nazovKlienta}` : ""}`.slice(0, 120),
      prefix: pristup.slice(0, 14),
      key_hash: hash(pristup),
      created_by: o.userId,
      expires_at: new Date(Date.now() + PLATNOST_TOKENU_S * 1000).toISOString(),
      // Kľúč účtu — asistent vyberá firmu pri každom nástroji (list_companies).
      ...(o.ucet ? { ucet_user_id: o.userId, firmy: null } : {}),
    } as any)
    .select("id")
    .single();
  if (error || !kluc)
    throw new OAuthChyba("server_error", error?.message ?? "Token sa nepodarilo vydať.", 500);
  const obnova = nahodny(32);
  const { error: e2 } = await supabaseAdmin.from("oauth_refresh_tokens").insert({
    token_hash: hash(obnova),
    client_id: o.clientId,
    company_id: o.companyId,
    user_id: o.userId,
    api_key_id: kluc.id,
    scope: o.ucet ? SCOPE_UCET : SCOPE,
    expires_at: new Date(Date.now() + PLATNOST_REFRESH_S * 1000).toISOString(),
  });
  if (e2) throw new OAuthChyba("server_error", e2.message, 500);
  return {
    access_token: pristup,
    token_type: "Bearer",
    expires_in: PLATNOST_TOKENU_S,
    refresh_token: obnova,
    scope: SCOPE,
  };
}

/** Token endpoint — výmena kódu (PKCE) alebo obnovenie tokenu (s rotáciou). */
export async function vymenToken(f: Record<string, string>) {
  const clientId = String(f.client_id ?? "");
  const { data: klient } = await supabaseAdmin
    .from("oauth_clients")
    .select("client_id, client_name")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!klient) throw new OAuthChyba("invalid_client", "Neznámy klient.", 401);

  if (f.grant_type === "authorization_code") {
    const kod = String(f.code ?? "");
    const overovac = String(f.code_verifier ?? "");
    if (!kod || !overovac)
      throw new OAuthChyba("invalid_request", "Chýba code alebo code_verifier.");
    // RFC 7636: 43–128 znakov z neobmedzenej abecedy.
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(overovac))
      throw new OAuthChyba("invalid_grant", "code_verifier nemá správny tvar.");
    // Kód sa zaberie naraz s overením nepoužitia — dvakrát vymeniť sa nedá ani súbežne.
    const { data: zaznam } = await supabaseAdmin
      .from("oauth_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("code_hash", hash(kod))
      .is("used_at", null)
      .select("*")
      .maybeSingle();
    if (!zaznam) {
      /*
        Opakované použitie kódu (RFC 6749 § 4.1.2): kód mohol uniknúť, preto
        sa zrušia aj tokeny, ktoré z neho po prvej výmene vznikli.
      */
      const { data: pouzity } = await supabaseAdmin
        .from("oauth_codes")
        .select("client_id, company_id, user_id, used_at")
        .eq("code_hash", hash(kod))
        .not("used_at", "is", null)
        .maybeSingle();
      if (pouzity && pouzity.client_id === clientId) {
        const { data: tokeny } = await supabaseAdmin
          .from("oauth_refresh_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("client_id", pouzity.client_id)
          .eq("company_id", pouzity.company_id)
          .eq("user_id", pouzity.user_id)
          .gte("created_at", pouzity.used_at)
          .is("revoked_at", null)
          .select("api_key_id");
        const kluce = (tokeny ?? []).map((x: any) => x.api_key_id).filter(Boolean);
        if (kluce.length)
          await supabaseAdmin
            .from("api_keys")
            .update({ revoked_at: new Date().toISOString() })
            .in("id", kluce);
      }
      throw new OAuthChyba("invalid_grant", "Kód je neplatný, použitý alebo vypršal.");
    }
    if (zaznam.client_id !== clientId || Date.parse(zaznam.expires_at) < Date.now()) {
      throw new OAuthChyba("invalid_grant", "Kód je neplatný, použitý alebo vypršal.");
    }
    if (f.redirect_uri && f.redirect_uri !== zaznam.redirect_uri) {
      throw new OAuthChyba("invalid_grant", "Návratová adresa nesedí s tou pri autorizácii.");
    }
    const vyzva = createHash("sha256").update(overovac).digest("base64url");
    if (vyzva !== zaznam.code_challenge)
      throw new OAuthChyba("invalid_grant", "PKCE overenie zlyhalo.");
    return vydajTokeny({
      clientId,
      companyId: zaznam.company_id,
      userId: zaznam.user_id,
      nazovKlienta: klient.client_name,
      ucet: jeUcet(zaznam.scope),
    });
  }

  if (f.grant_type === "refresh_token") {
    const { data: stary } = await supabaseAdmin
      .from("oauth_refresh_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", hash(String(f.refresh_token ?? "")))
      .is("revoked_at", null)
      .select("*")
      .maybeSingle();
    if (!stary || stary.client_id !== clientId || Date.parse(stary.expires_at) < Date.now()) {
      throw new OAuthChyba("invalid_grant", "Obnovovací token je neplatný alebo vypršal.");
    }
    /*
      Kľúč zrušený v API kľúčoch (človek) ruší aj obnovu — inak by si klient
      zrušený prístup vrátil ďalším refreshom. Zruší sa celý rad tokenov.
    */
    if (stary.api_key_id) {
      const { data: kluc } = await supabaseAdmin
        .from("api_keys")
        .select("revoked_at")
        .eq("id", stary.api_key_id)
        .maybeSingle();
      if (!kluc || kluc.revoked_at) {
        await supabaseAdmin
          .from("oauth_refresh_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("client_id", stary.client_id)
          .eq("company_id", stary.company_id)
          .eq("user_id", stary.user_id)
          .is("revoked_at", null);
        throw new OAuthChyba("invalid_grant", "Prístup bol zrušený.");
      }
    }
    // Starý prístupový token po obnovení prestane platiť.
    if (stary.api_key_id) {
      await supabaseAdmin
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", stary.api_key_id);
    }
    // Člen, ktorého z firmy odobrali alebo mu znížili rolu, si prístup obnoviť nesmie
    // (vydať ho smie len majiteľ alebo admin — rovnako pri obnove).
    const ucet = jeUcet(stary.scope);
    // Kľúč účtu: stačí, že je ešte niekde vlastník alebo admin (ktoré firmy, rieši každá požiadavka).
    let q = supabaseAdmin
      .from("company_users")
      .select("role, company_id")
      .eq("user_id", stary.user_id)
      .in("role", ["owner", "admin"]);
    if (!ucet) q = q.eq("company_id", stary.company_id);
    const { data: clen } = await q.limit(1);
    if (!clen?.length) throw new OAuthChyba("invalid_grant", "Používateľ už k firme nemá prístup.");
    return vydajTokeny({
      clientId,
      companyId: ucet ? String(clen[0].company_id) : stary.company_id,
      userId: stary.user_id,
      nazovKlienta: klient.client_name,
      ucet,
    });
  }

  throw new OAuthChyba(
    "unsupported_grant_type",
    "Podporované sú authorization_code a refresh_token.",
  );
}

/** Zrušenie tokenu (RFC 7009) — odpoveď je vždy 200, aj keď token nepoznáme. */
export async function zrusToken(f: Record<string, string>) {
  const t = String(f.token ?? "");
  if (!t) return;
  if (t.startsWith("fk_mcp_")) {
    await supabaseAdmin
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("key_hash", hash(t));
    return;
  }
  const { data: r } = await supabaseAdmin
    .from("oauth_refresh_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", hash(t))
    .select("api_key_id")
    .maybeSingle();
  if (r?.api_key_id) {
    await supabaseAdmin
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", r.api_key_id);
  }
}

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export function json(telo: unknown, status = 200, hlavicky: Record<string, string> = {}) {
  return new Response(JSON.stringify(telo), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...CORS,
      ...hlavicky,
    },
  });
}

export function chybaOdpoved(e: unknown) {
  if (e instanceof OAuthChyba)
    return json({ error: e.kod, error_description: e.message }, e.status);
  // Surovú chybu databázy klientovi neukazujeme — ide len do logu.
  console.error("[oauth]", String((e as Error)?.message ?? e).slice(0, 300));
  return json({ error: "server_error", error_description: "Interná chyba servera." }, 500);
}

/** Telo POST požiadavky — OAuth posiela formulár, niektoré klienty JSON. */
export async function teloFormulara(request: Request): Promise<Record<string, string>> {
  const typ = request.headers.get("content-type") ?? "";
  if (typ.includes("application/json")) {
    const j = await request.json().catch(() => ({}));
    return Object.fromEntries(Object.entries(j ?? {}).map(([k, v]) => [k, String(v)]));
  }
  const text = await request.text();
  return Object.fromEntries(new URLSearchParams(text));
}
