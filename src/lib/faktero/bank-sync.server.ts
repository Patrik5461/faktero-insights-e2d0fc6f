/**
 * Denná automatická synchronizácia bankových účtov a transakcií (Tatra banka).
 * Volané cez pg_cron → /api/public/hooks/bank-sync.
 *
 * Robí to isté, čo tlačidlo "Synchronizovať" v apke, ale pre všetky pripojenia
 * naraz a bez prihláseného používateľa — preto ide cez supabaseAdmin.
 */

type SyncResult = {
  connection_id: string;
  company_id: string;
  accounts: number;
  inserted: number;
  error?: string;
};

/** Prekrytie okna sťahovania. Denný beh, 14 dní kvôli dodatočne zaúčtovaným položkám. */
const DEFAULT_DAYS_BACK = 14;

/**
 * Vráti platný access token. Ak mu do vypršania ostáva menej než 10 minút a máme
 * refresh token, obnoví ho a nový rovno uloží.
 */
async function ensureFreshToken(supabaseAdmin: any, conn: any): Promise<string> {
  const expiresAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : 0;
  const staleSoon = expiresAt > 0 && expiresAt - Date.now() < 10 * 60 * 1000;
  if (!staleSoon || !conn.refresh_token) return conn.access_token;

  const { refreshAccessToken } = await import("./tatrabanka.server");
  const tokens = await refreshAccessToken(conn.refresh_token);
  const newExpiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
  await supabaseAdmin
    .from("bank_connections")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? conn.refresh_token,
      token_expires_at: newExpiry,
    })
    .eq("id", conn.id);
  console.log(`[bank-sync] token obnovený pre pripojenie ${conn.id}`);
  return tokens.access_token;
}

/** Uloží účty pripojenia (vrátane zostatkov) a vráti ich DB riadky. */
async function syncAccounts(supabaseAdmin: any, conn: any, accessToken: string) {
  const { fetchAccounts } = await import("./tatrabanka.server");
  const list = await fetchAccounts(accessToken, conn.consent_id ?? null);
  const now = new Date().toISOString();

  for (const a of list) {
    const { data: existing } = await supabaseAdmin
      .from("bank_accounts")
      .select("id")
      .eq("bank_connection_id", conn.id)
      .eq("external_account_id", a.external_account_id)
      .maybeSingle();
    const row = {
      iban: a.iban,
      account_name: a.account_name,
      currency: a.currency,
      balance: a.balance,
      last_synced_at: now,
    };
    if (existing) {
      await supabaseAdmin.from("bank_accounts").update(row).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("bank_accounts").insert({
        company_id: conn.company_id,
        bank_connection_id: conn.id,
        external_account_id: a.external_account_id,
        ...row,
      });
    }
  }

  const { data: accounts } = await supabaseAdmin
    .from("bank_accounts")
    .select("id, external_account_id, iban")
    .eq("bank_connection_id", conn.id);
  return accounts ?? [];
}

/** Stiahne transakcie účtu a vloží len tie, ktoré ešte nemáme. */
async function syncTransactions(
  supabaseAdmin: any,
  conn: any,
  accessToken: string,
  account: any,
  daysBack: number,
): Promise<number> {
  const { fetchTransactions } = await import("./tatrabanka.server");
  const txs = await fetchTransactions(
    accessToken,
    account.external_account_id ?? account.iban ?? "",
    conn.consent_id ?? null,
    daysBack,
  );

  // Referencie už uložených transakcií načítame naraz — inak by to bol jeden
  // SELECT na každú transakciu a pri 300+ položkách denne to je zbytočná záťaž.
  const { data: known } = await supabaseAdmin
    .from("bank_transactions")
    .select("transaction_reference")
    .eq("bank_account_id", account.id)
    .not("transaction_reference", "is", null);
  const seen = new Set((known ?? []).map((r: any) => r.transaction_reference));

  const fresh = txs.filter((t) => !t.transaction_reference || !seen.has(t.transaction_reference));
  if (fresh.length === 0) return 0;

  const { error, data } = await supabaseAdmin
    .from("bank_transactions")
    .insert(
      fresh.map((t) => ({
        company_id: conn.company_id,
        bank_account_id: account.id,
        booking_date: t.booking_date,
        amount: t.amount,
        currency: t.currency,
        variable_symbol: t.variable_symbol,
        counterparty: t.counterparty,
        description: t.description,
        transaction_reference: t.transaction_reference,
      })),
    )
    .select("id");
  if (error) throw new Error(`insert_failed: ${error.message}`);
  return data?.length ?? 0;
}

/**
 * Prejde všetky pripojené banky a natiahne účty aj transakcie.
 * Chyba na jednom pripojení nezhodí ostatné — zapíše sa do výsledku.
 */
export async function runDailyBankSync(daysBack = DEFAULT_DAYS_BACK) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: connections } = await supabaseAdmin
    .from("bank_connections")
    .select("*")
    .eq("provider", "tatrabanka")
    .eq("status", "connected");

  const results: SyncResult[] = [];

  for (const conn of connections ?? []) {
    const base = { connection_id: conn.id, company_id: conn.company_id, accounts: 0, inserted: 0 };
    try {
      if (!conn.access_token) throw new Error("chýba access_token");
      const accessToken = await ensureFreshToken(supabaseAdmin, conn);
      const accounts = await syncAccounts(supabaseAdmin, conn, accessToken);
      let inserted = 0;
      for (const acc of accounts) {
        inserted += await syncTransactions(supabaseAdmin, conn, accessToken, acc, daysBack);
      }
      await supabaseAdmin
        .from("bank_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", conn.id);
      results.push({ ...base, accounts: accounts.length, inserted });
    } catch (e: any) {
      const error = e?.message ?? "sync_failed";
      console.error(`[bank-sync] pripojenie ${conn.id} zlyhalo:`, error);
      results.push({ ...base, error });
    }
  }

  const inserted = results.reduce((s, r) => s + r.inserted, 0);
  const failed = results.filter((r) => r.error).length;
  console.log(
    `[bank-sync] hotovo: ${results.length} pripojení, ${inserted} nových transakcií, ${failed} chýb`,
  );
  return { connections: results.length, inserted, failed, results };
}
