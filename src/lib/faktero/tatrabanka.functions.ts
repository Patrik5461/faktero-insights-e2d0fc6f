import { createServerFn } from "@tanstack/react-start";
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
    const { isTatraConfigured, buildAuthorizeUrl, getRedirectUri } =
      await import("./tatrabanka.server");
    if (!isTatraConfigured()) throw new Error("not_configured");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn, error } = await supabaseAdmin
      .from("bank_connections")
      .insert({ company_id: data.company_id, provider: "tatrabanka", status: "pending" })
      .select("id")
      .single();
    if (error || !conn) throw new Error(error?.message ?? "insert_failed");
    const redirectUri = getRedirectUri(origin());
    const url = buildAuthorizeUrl({ state: conn.id, redirectUri });
    return { authorize_url: url };
  });

/** Diagnostic preview: build the authorize URL without touching the DB. */
export const previewTatraAuthorizeUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { isTatraConfigured, buildAuthorizeUrl, getRedirectUri } =
      await import("./tatrabanka.server");
    const configured = isTatraConfigured();
    const org = origin();
    const redirectUri = getRedirectUri(org);
    const authorize_url = configured
      ? buildAuthorizeUrl({ state: "preview-state-0000", redirectUri })
      : null;
    const scope = (process.env.TB_SCOPE ?? "AISP").trim();
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
    const { fetchAccounts } = await import("./tatrabanka.server");
    // TB Premium API: consent is granted via OAuth access_token; no separate consent flow.
    const list = await fetchAccounts(conn.access_token, conn.consent_id ?? null);
    for (const a of list) {
      const { data: existing } = await supabaseAdmin
        .from("bank_accounts")
        .select("id")
        .eq("bank_connection_id", conn.id)
        .eq("external_account_id", a.external_account_id)
        .maybeSingle();
      if (existing) {
        await supabaseAdmin
          .from("bank_accounts")
          .update({
            iban: a.iban,
            account_name: a.account_name,
            currency: a.currency,
            balance: a.balance,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("bank_accounts").insert({
          company_id: data.company_id,
          bank_connection_id: conn.id,
          external_account_id: a.external_account_id,
          iban: a.iban,
          account_name: a.account_name,
          currency: a.currency,
          balance: a.balance,
          last_synced_at: new Date().toISOString(),
        });
      }
    }
    await supabaseAdmin
      .from("bank_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", conn.id);
    return { ok: true, count: list.length };
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
      conn.access_token,
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

/** Disconnect: delete connection (cascades accounts + transactions). */
export const disconnectBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ConnInput.parse(d))
  .handler(async ({ data, context }) => {
    const role = await assertMember(context.supabase, context.userId, data.company_id);
    if (!["owner", "admin"].includes(role)) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
