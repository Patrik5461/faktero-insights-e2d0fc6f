import { createServerFn } from "@tanstack/react-start";
import { bankToken } from "./bank-tokens.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

const CompanyInput = z.object({ company_id: z.string().uuid() });

async function assertMember(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("company_users")
    .select("user_id, role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
  return data.role as string;
}

function origin(): string {
  // TB sandbox requires an exact, publicly-reachable redirect_uri registered in
  // the developer portal. Inside the Lovable preview sandbox getRequestHost()
  // returns "localhost:8080", which TB rejects with invalid_redirect_uri.
  // Allow an explicit override and prefer x-forwarded-* headers.
  const override = process.env.APP_PUBLIC_URL?.replace(/\/$/, "");
  if (override) return override;
  const fwdHost = getRequestHeader("x-forwarded-host");
  const fwdProto = getRequestHeader("x-forwarded-proto") ?? "https";
  if (fwdHost) return `${fwdProto}://${fwdHost}`;
  const host = getRequestHost();
  return `https://${host}`;
}

/**
 * Verejná IP používateľa pre PSU hlavičky banky. Server beží za nginxom, takže
 * skutočnú adresu vieme len z proxy hlavičky — loopback (127.0.0.1) banke
 * posielať nemá zmysel, tvárili by sme sa, že platbu inicioval server.
 */
function clientIp(): string | null {
  const candidates = [
    getRequestHeader("x-forwarded-for")?.split(",")[0],
    getRequestHeader("x-real-ip"),
    getRequestHeader("cf-connecting-ip"),
  ];
  for (const c of candidates) {
    const ip = c?.trim();
    if (ip && !/^(127\.|::1$|localhost$)/.test(ip)) return ip;
  }
  return null;
}

/** List bank connections for a company (NO tokens returned). */
export const listBankData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.company_id);
    const { data: connections } = await context.supabase
      .from("bank_connections")
      .select("id, provider, status, consent_id, last_synced_at, token_expires_at, created_at")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false });
    const { data: accounts } = await context.supabase
      .from("bank_accounts")
      .select(
        "id, bank_connection_id, iban, account_name, currency, balance, last_synced_at, external_account_id",
      )
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: true });
    return { connections: connections ?? [], accounts: accounts ?? [] };
  });

/** Start OAuth connect: create pending connection, return authorize URL. */
export const startBankConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyInput.parse(d))
  .handler(async ({ data, context }) => {
    const role = await assertMember(context.supabase, context.userId, data.company_id);
    if (!["owner", "admin"].includes(role)) throw new Error("Forbidden");
    const { isTatraConfigured, buildAuthorizeUrl, getRedirectUri, createConsent, createPkcePair } =
      await import("./tatrabanka.server");
    if (!isTatraConfigured()) throw new Error("not_configured");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // TB chce consent ešte pred presmerovaním — jeho id ide do scope authorize URL.
    const consentId = await createConsent();
    const { verifier, challenge } = createPkcePair();
    const { data: conn, error } = await supabaseAdmin
      .from("bank_connections")
      .insert({
        company_id: data.company_id,
        provider: "tatrabanka",
        status: "pending",
        consent_id: consentId,
        // code_verifier sa spotrebuje až v callbacku; bank_connections naň nemá
        // stĺpec, takže žije v metadata a po výmene kódu sa maže.
        metadata: { pkce_code_verifier: verifier },
      })
      .select("id")
      .single();
    if (error || !conn) throw new Error(error?.message ?? "insert_failed");
    const redirectUri = getRedirectUri(origin());
    const url = buildAuthorizeUrl({
      state: conn.id,
      redirectUri,
      consentId,
      codeChallenge: challenge,
    });
    return { authorize_url: url };
  });

/**
 * Obnoví súhlas na existujúcom pripojení — bez odpojenia a bez straty dát.
 *
 * Odpojenie banky maže účty a s nimi kaskádovo aj transakcie a výpisy, takže
 * „odpoj a pripoj znova“ nie je cesta. Tu vznikne nový súhlas, používateľ ho
 * potvrdí v banke a v callbacku sa len prepíšu tokeny; účty sa spárujú podľa
 * IBAN, takže história ostane visieť na tých istých riadkoch.
 *
 * Nový súhlas nesie `combinedServiceIndicator`, ktorý staršie súhlasy nemali —
 * bez neho banka odmietne platbu z účtu vedeného v inej banke.
 */
export const renewBankConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ConnInput.parse(d))
  .handler(async ({ data, context }) => {
    const role = await assertMember(context.supabase, context.userId, data.company_id);
    if (!["owner", "admin"].includes(role)) throw new Error("Forbidden");
    const { isTatraConfigured, buildAuthorizeUrl, getRedirectUri, createConsent, createPkcePair } =
      await import("./tatrabanka.server");
    if (!isTatraConfigured()) throw new Error("not_configured");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: conn } = await supabaseAdmin
      .from("bank_connections")
      .select("id, consent_id, metadata")
      .eq("id", data.connection_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!conn) throw new Error("not_found");

    const consentId = await createConsent();
    const { verifier, challenge } = createPkcePair();
    // Starý súhlas necháme platiť, kým používateľ nový nepotvrdí — keď to
    // vzdá na polceste, čítanie účtov mu funguje ďalej.
    const { error } = await supabaseAdmin
      .from("bank_connections")
      .update({
        metadata: {
          ...((conn.metadata as any) ?? {}),
          pkce_code_verifier: verifier,
          pending_consent_id: consentId,
          previous_consent_id: conn.consent_id ?? null,
        },
      })
      .eq("id", conn.id);
    if (error) throw new Error(error.message);

    return {
      authorize_url: buildAuthorizeUrl({
        state: conn.id,
        redirectUri: getRedirectUri(origin()),
        consentId,
        codeChallenge: challenge,
      }),
    };
  });

/** Diagnostic preview: build the authorize URL without touching the DB. */
export const previewTatraAuthorizeUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // authorize_url nesie TB_CLIENT_ID a redirect_uri celej platformy — to nie je
    // údaj firmy, preto len platform admin.
    const { data: isPlatformAdmin } = await context.supabase.rpc("is_platform_admin", {
      _user_id: context.userId,
    });
    if (!isPlatformAdmin) throw new Error("Forbidden: platform admin only");

    const { isTatraConfigured, buildAuthorizeUrl, getRedirectUri } =
      await import("./tatrabanka.server");
    const configured = isTatraConfigured();
    const org = origin();
    const redirectUri = getRedirectUri(org);
    // Náhľad nezakladá consent — ukazuje tvar URL so zástupným id.
    const authorize_url = configured
      ? buildAuthorizeUrl({
          state: "preview-state-0000",
          redirectUri,
          consentId: "preview-consent-0000",
          codeChallenge: "preview-challenge-0000",
        })
      : null;
    const scope = "PREMIUM_AIS:<consentId>";
    const env = (process.env.TB_ENV ?? "sandbox").toLowerCase();
    return { configured, env, origin: org, redirect_uri: redirectUri, scope, authorize_url };
  });

const ConnInput = z.object({ company_id: z.string().uuid(), connection_id: z.string().uuid() });

/** Sync accounts list from TB for a connection. */
export const syncBankAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ConnInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn } = await supabaseAdmin
      .from("bank_connections")
      .select("*")
      .eq("id", data.connection_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!conn || conn.status !== "connected" || !conn.access_token)
      throw new Error("not_connected");

    // Účty mimo TB banka obnovuje sama 4× denne. Keď synchronizáciu spustí
    // človek, pošleme aj žiadosť o obnovu — má pri sebe PSU údaje, ktoré API
    // vyžaduje. Beží asynchrónne, takže sa prejaví až o chvíľu.
    const meta = (conn.metadata as any) ?? {};
    const lastRefresh = meta.last_refresh_at ? Date.parse(meta.last_refresh_at) : 0;
    let refreshRequested = false;
    if (Date.now() - lastRefresh > 30_000) {
      try {
        const { refreshExternalBanks } = await import("./tatrabanka.server");
        // Bez PSU-IP-Address odmietne banka obnovu s 400, takže ju bez známej
        // adresy klienta ani neposielame. Adresa príde len cez proxy hlavičku —
        // keď ju nginx nedopĺňa, obnova sa ticho preskočí a účty sa načítajú
        // z toho, čo banka obnovila sama (4× denne).
        const ip = clientIp();
        const taskId = ip
          ? await refreshExternalBanks(bankToken(conn.access_token)!, {
              ip,
              userAgent: getRequestHeader("user-agent") ?? null,
              deviceOs: getRequestHeader("sec-ch-ua-platform")?.replace(/"/g, "") ?? null,
            })
          : null;
        if (!ip) console.warn("[tatrabanka] obnova externých bánk preskočená — chýba IP klienta");
        refreshRequested = !!taskId;
        await supabaseAdmin
          .from("bank_connections")
          .update({ metadata: { ...meta, last_refresh_at: new Date().toISOString() } })
          .eq("id", conn.id);
      } catch (e) {
        console.error("[tatrabanka] refresh preskočený", e);
      }
    }

    const { fetchAccounts, upsertBankAccounts } = await import("./tatrabanka.server");
    // TB Premium API: consent is granted via OAuth access_token; no separate consent flow.
    const list = await fetchAccounts(bankToken(conn.access_token)!, conn.consent_id ?? null);
    await upsertBankAccounts(data.company_id, conn.id, list);
    await supabaseAdmin
      .from("bank_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", conn.id);
    return { ok: true, count: list.length, refresh_requested: refreshRequested };
  });

const AccountInput = z.object({ company_id: z.string().uuid(), account_id: z.string().uuid() });

/** Sync transactions for an account (last 90 days). */
export const syncBankTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => AccountInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acc } = await supabaseAdmin
      .from("bank_accounts")
      .select("*, bank_connections(*)")
      .eq("id", data.account_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!acc) throw new Error("not_found");
    const conn: any = (acc as any).bank_connections;
    if (!conn?.access_token) throw new Error("not_connected");
    const { fetchTransactions } = await import("./tatrabanka.server");
    const txs = await fetchTransactions(
      bankToken(conn.access_token)!,
      acc.external_account_id ?? acc.iban ?? "",
      conn.consent_id,
      90,
    );
    let inserted = 0;
    for (const t of txs) {
      const ref = t.transaction_reference;
      if (ref) {
        const { data: ex } = await supabaseAdmin
          .from("bank_transactions")
          .select("id")
          .eq("bank_account_id", acc.id)
          .eq("transaction_reference", ref)
          .maybeSingle();
        if (ex) continue;
      }
      const { error } = await supabaseAdmin.from("bank_transactions").insert({
        company_id: data.company_id,
        bank_account_id: acc.id,
        booking_date: t.booking_date,
        amount: t.amount,
        currency: t.currency,
        variable_symbol: t.variable_symbol,
        counterparty: t.counterparty,
        description: t.description,
        transaction_reference: ref,
      });
      if (!error) inserted++;
    }
    await supabaseAdmin
      .from("bank_accounts")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", acc.id);
    return { ok: true, inserted, total: txs.length };
  });

/** Zoznam mesačných výpisov firmy (bez súborov — tie sa sťahujú cez podpísaný odkaz). */
export const listBankStatements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.company_id);
    const { data: rows } = await context.supabase
      .from("bank_statements")
      .select(
        "id, bank_account_id, period_start, period_end, export_type, status, source, file_size, error, created_at",
      )
      .eq("company_id", data.company_id)
      .order("period_start", { ascending: false });
    return { statements: rows ?? [] };
  });

const StatementInput = z.object({
  company_id: z.string().uuid(),
  statement_id: z.string().uuid(),
});

/** Podpísaný odkaz na stiahnutie výpisu. Platnosť 5 minút, bucket je privátny. */
export const getBankStatementUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => StatementInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("bank_statements")
      .select("storage_path, status, company_id")
      .eq("id", data.statement_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!row || row.status !== "ready" || !row.storage_path) throw new Error("not_ready");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("bank-statements")
      .createSignedUrl(row.storage_path, 300);
    if (error || !signed) throw new Error(error?.message ?? "sign_failed");
    return { url: signed.signedUrl };
  });

/** Disconnect: delete connection (cascades accounts + transactions). */
export const disconnectBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ConnInput.parse(d))
  .handler(async ({ data, context }) => {
    const role = await assertMember(context.supabase, context.userId, data.company_id);
    if (!["owner", "admin"].includes(role)) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn } = await supabaseAdmin
      .from("bank_connections")
      .select("consent_id")
      .eq("id", data.connection_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    // Súhlas treba zrušiť aj v banke, inak tam ostane platný. Keď to zlyhá,
    // odpojenie aj tak dokončíme — používateľ o prístup prísť chce.
    if (conn?.consent_id) {
      try {
        const { revokeConsent } = await import("./tatrabanka.server");
        await revokeConsent(conn.consent_id);
      } catch (e) {
        console.error("[tatrabanka] zrušenie súhlasu v banke zlyhalo", e);
      }
    }
    await supabaseAdmin
      .from("bank_connections")
      .delete()
      .eq("id", data.connection_id)
      .eq("company_id", data.company_id);
    return { ok: true };
  });

/** List transactions with optional account filter. */
const ListTxInput = z.object({
  company_id: z.string().uuid(),
  account_id: z.string().uuid().optional(),
  limit: z.number().min(1).max(500).default(200),
});
export const listBankTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ListTxInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.company_id);
    let q = context.supabase
      .from("bank_transactions")
      .select(
        "id, bank_account_id, booking_date, amount, currency, variable_symbol, counterparty, description, transaction_reference, matched_invoice_id",
      )
      .eq("company_id", data.company_id)
      .order("booking_date", { ascending: false })
      .limit(data.limit);
    if (data.account_id) q = q.eq("bank_account_id", data.account_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { transactions: rows ?? [] };
  });
