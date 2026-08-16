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
  /** Účty, ktoré sa nepodarilo stiahnuť — zvyšok pripojenia beží ďalej. */
  failed_accounts?: string[];
  error?: string;
};

/** Prekrytie okna sťahovania. Denný beh, 14 dní kvôli dodatočne zaúčtovaným položkám. */
const DEFAULT_DAYS_BACK = 14;

/**
 * Vráti platný access token. Ak mu do vypršania ostáva menej než 10 minút a máme
 * refresh token, obnoví ho a nový rovno uloží.
 */
async function ensureFreshToken(supabaseAdmin: any, conn: any): Promise<string> {
  const { bankToken, zasifrujBankToken } = await import("./bank-tokens.server");
  const platnyToken = bankToken(conn.access_token);
  const platnyRefresh = bankToken(conn.refresh_token);
  const expiresAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : 0;
  const staleSoon = expiresAt > 0 && expiresAt - Date.now() < 10 * 60 * 1000;
  if (!staleSoon || !platnyRefresh) return platnyToken ?? "";

  const { refreshAccessToken } = await import("./tatrabanka.server");
  const tokens = await refreshAccessToken(platnyRefresh);
  const newExpiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
  await supabaseAdmin
    .from("bank_connections")
    .update({
      access_token: zasifrujBankToken(tokens.access_token),
      refresh_token: zasifrujBankToken(tokens.refresh_token ?? platnyRefresh),
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
      booked_balance: a.booked_balance ?? null,
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

/** Najdlhšie okno, ktoré Tatra banka na transakciách dáva. */
export const MAX_DAYS_BACK = 90;

/**
 * Referencie pohybov, ktoré na účte už máme, od zadaného dňa.
 *
 * Číta sa po tisíckach: PostgREST vracia bez `range` najviac 1000 riadkov a
 * jeden účet ich za 90 dní pokojne má viac. Neúplný zoznam by znamenal, že sa
 * tie isté pohyby vložia druhý raz — teda tichý duplikát v účtovníctve.
 */
export async function znameReferencie(
  supabaseAdmin: any,
  accountId: string,
  odDna: string,
): Promise<Set<string>> {
  const seen = new Set<string>();
  const KROK = 1000;
  for (let od = 0; ; od += KROK) {
    const { data, error } = await supabaseAdmin
      .from("bank_transactions")
      .select("transaction_reference")
      .eq("bank_account_id", accountId)
      .gte("booking_date", odDna)
      .not("transaction_reference", "is", null)
      .order("booking_date", { ascending: true })
      .range(od, od + KROK - 1);
    if (error) throw new Error(`known_failed: ${error.message}`);
    for (const r of data ?? []) seen.add(r.transaction_reference);
    if (!data || data.length < KROK) return seen;
  }
}

/**
 * Stiahne transakcie účtu a vloží len tie, ktoré ešte nemáme.
 *
 * Účet, na ktorom zatiaľ nemáme ani jeden pohyb (čerstvo pripojená banka),
 * sa ťahá na plných 90 dní. Bez toho by novo pripojenému účtu navždy chýbalo
 * všetko staršie než okno denného behu.
 */
export async function stiahniTransakcieUctu(
  supabaseAdmin: any,
  conn: any,
  accessToken: string,
  account: any,
  daysBack: number,
): Promise<{ inserted: number; total: number }> {
  const { count } = await supabaseAdmin
    .from("bank_transactions")
    .select("id", { count: "exact", head: true })
    .eq("bank_account_id", account.id);
  const okno = (count ?? 0) === 0 ? MAX_DAYS_BACK : daysBack;

  const { fetchTransactions } = await import("./tatrabanka.server");
  const txs = await fetchTransactions(
    accessToken,
    account.external_account_id ?? account.iban ?? "",
    conn.consent_id ?? null,
    okno,
  );

  const odDna = new Date(Date.now() - okno * 86400_000).toISOString().slice(0, 10);
  const seen = await znameReferencie(supabaseAdmin, account.id, odDna);

  const fresh = txs.filter((t) => !t.transaction_reference || !seen.has(t.transaction_reference));
  if (fresh.length === 0) return { inserted: 0, total: txs.length };

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
  return { inserted: data?.length ?? 0, total: txs.length };
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
      /*
       * Účty sa ťahajú každý zvlášť a chyba jedného nesmie zhodiť ostatné.
       * Firmy majú v jednom pripojení aj účty vedené v iných bankách (TB ich
       * sprístupňuje cez multibanking) a tie sa správajú inak — keby na nich
       * sťahovanie padlo, o zvyšné účty by firma prišla celkom.
       */
      let inserted = 0;
      const chybneUcty: string[] = [];
      for (const acc of accounts) {
        try {
          const r = await stiahniTransakcieUctu(supabaseAdmin, conn, accessToken, acc, daysBack);
          inserted += r.inserted;
        } catch (e: any) {
          chybneUcty.push(acc.iban ?? acc.id);
          console.error(`[bank-sync] účet ${acc.iban ?? acc.id} zlyhal:`, e?.message ?? e);
        }
      }
      if (chybneUcty.length) {
        console.error(
          `[bank-sync] pripojenie ${conn.id}: nepodarilo sa ${chybneUcty.length} účtov (${chybneUcty.join(", ")})`,
        );
      }
      await supabaseAdmin
        .from("bank_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", conn.id);

      /*
       * Nové pohyby hneď spárujeme. Zapíše sa len isté (sedí variabilný symbol
       * aj suma) — sporné ostávajú návrhmi, presne ako pri ručnom párovaní.
       * Bez tohto kroku by peniaze na účte ležali nespárované až dovtedy, kým
       * si niekto otvorí párovanie, a upozornenie o úhrade by nemalo vzniknúť.
       */
      if (inserted > 0 && conn.company_id) {
        try {
          const { sparujFirmuAutomaticky } = await import("./parovanie.functions");
          const { uhradene } = await sparujFirmuAutomaticky(conn.company_id);
          if (uhradene.length) {
            const { oznamUhradu } = await import("./push-uhrada.server");
            await oznamUhradu(conn.company_id, uhradene);
          }
        } catch (e: any) {
          // Párovanie je nadstavba — keď zlyhá, stiahnuté pohyby ostávajú.
          console.error(`[bank-sync] párovanie firmy ${conn.company_id} zlyhalo:`, e?.message ?? e);
        }

        /*
          To isté pre splátky leasingov a úverov. Je to samostatný prechod:
          faktúry sa párujú z prichádzajúcich platieb, splátky z odchádzajúcich,
          a pravidlá sú iné — pri splátkach nestačí suma, lebo sú každý mesiac
          rovnaké.
        */
        try {
          const { sparujSplatkyFirmyAutomaticky } = await import("./financovanie.functions");
          const { zapisanych } = await sparujSplatkyFirmyAutomaticky(conn.company_id);
          if (zapisanych > 0) {
            console.log(`[bank-sync] firma ${conn.company_id}: spárovaných splátok ${zapisanych}`);
          }
        } catch (e: any) {
          console.error(
            `[bank-sync] párovanie splátok firmy ${conn.company_id} zlyhalo:`,
            e?.message ?? e,
          );
        }
      }

      results.push({
        ...base,
        accounts: accounts.length,
        inserted,
        ...(chybneUcty.length ? { failed_accounts: chybneUcty } : {}),
      });
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
