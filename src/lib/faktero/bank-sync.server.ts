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
    .select("id, external_account_id, iban, unavailable_since, unavailable_reason")
    .eq("bank_connection_id", conn.id);
  return accounts ?? [];
}

/**
 * Ako ďaleko dozadu sa oplatí pýtať pri účte, na ktorom ešte nič nemáme.
 *
 * Banka pustí pri každom účte inak ďaleko — bežne rok aj viac — a hranicu
 * povie až v chybe. `fetchTransactions` ju z nej prečíta a dopyt zopakuje s
 * dátumom, ktorý banka ponúkla, takže tu môže stáť pokojne viac, než dá.
 */
export const MAX_DAYS_BACK = 500;

/**
 * Referencie pohybov, ktoré na účte už máme, od zadaného dňa.
 *
 * Číta sa po tisíckach: PostgREST vracia bez `range` najviac 1000 riadkov a
 * jeden účet ich za 90 dní pokojne má viac. Neúplný zoznam by znamenal, že sa
 * tie isté pohyby vložia druhý raz — teda tichý duplikát v účtovníctve.
 *
 * Radí sa podľa `id`, nie podľa dňa zaúčtovania. Pri radení podľa dňa má
 * databáza pri rovnakom dni voľnú ruku v poradí a medzi stranami tak riadky
 * vypadávajú — na účte s piatimi tisíckami pohybov to skončilo pokusom vložiť
 * pohyby, ktoré tam už boli.
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
      .order("id", { ascending: true })
      .range(od, od + KROK - 1);
    if (error) throw new Error(`known_failed: ${error.message}`);
    for (const r of data ?? []) seen.add(r.transaction_reference);
    if (!data || data.length < KROK) return seen;
  }
}

/**
 * Stiahne transakcie účtu a vloží len tie, ktoré ešte nemáme.
 *
 * Účet, na ktorom zatiaľ nemáme ani jeden pohyb (čerstvo pripojená banka), sa
 * ťahá tak ďaleko, ako banka pustí. Bez toho by novo pripojenému účtu navždy
 * chýbalo všetko staršie než okno denného behu.
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

  // Sem sa dostaneme len keď banka účet vydala — prípadná stará značka
  // o nedostupnosti tým prestáva platiť.
  if (account.unavailable_since) {
    await supabaseAdmin
      .from("bank_accounts")
      .update({ unavailable_since: null, unavailable_reason: null })
      .eq("id", account.id);
  }

  const fresh = txs.filter((t) => !t.transaction_reference || !seen.has(t.transaction_reference));
  if (fresh.length === 0) return { inserted: 0, total: txs.length };

  const riadky = fresh.map((t) => ({
    company_id: conn.company_id,
    bank_account_id: account.id,
    booking_date: t.booking_date,
    amount: t.amount,
    currency: t.currency,
    variable_symbol: t.variable_symbol,
    counterparty: t.counterparty,
    description: t.description,
    transaction_reference: t.transaction_reference,
  }));
  return { inserted: await vlozPohyby(supabaseAdmin, riadky), total: txs.length };
}

/**
 * Vloží pohyby a nedá sa zhodiť jedným, ktorý tam už je.
 *
 * Zoznam známych referencií je prvá obrana proti duplicitám, jedinečný index
 * druhá. Keď zaberie tá druhá, Postgres zhodí celý zápis — a účet, ktorý mal
 * pribudnúť o rok histórie, neuloží nič. Preto sa píše po dávkach a dávka,
 * ktorá narazí na duplicitu, sa zopakuje po riadkoch.
 *
 * `upsert` sa použiť nedá: index je čiastočný (`where transaction_reference is
 * not null`) a taký sa ako cieľ `on conflict` cez PostgREST vybrať nedá.
 */
export async function vlozPohyby(supabaseAdmin: any, riadky: any[]): Promise<number> {
  const DAVKA = 500;
  let vlozenych = 0;
  for (let od = 0; od < riadky.length; od += DAVKA) {
    const cast = riadky.slice(od, od + DAVKA);
    const { error, data } = await supabaseAdmin.from("bank_transactions").insert(cast).select("id");
    if (!error) {
      vlozenych += data?.length ?? 0;
      continue;
    }
    if (!/duplicate key|23505/.test(error.message ?? "")) {
      throw new Error(`insert_failed: ${error.message}`);
    }
    for (const r of cast) {
      const { error: e1 } = await supabaseAdmin.from("bank_transactions").insert(r);
      if (!e1) vlozenych += 1;
      else if (!/duplicate key|23505/.test(e1.message ?? "")) {
        throw new Error(`insert_failed: ${e1.message}`);
      }
    }
  }
  return vlozenych;
}

/**
 * Banka pozná účet, ktorý u nás máme? Keď odpovie `NO_ACCOUNT`, nemá zmysel
 * pýtať sa každú noc znova — účet buď zanikol, alebo ho nekryje súhlas.
 * Zapíšeme si to k účtu a nočný beh ho odvtedy preskočí; ručné stiahnutie
 * z prehľadu ho skúsi vždy a pri prvom úspechu značku zmaže.
 */
async function oznacNedostupny(supabaseAdmin: any, accountId: string, dovod: string) {
  await supabaseAdmin
    .from("bank_accounts")
    .update({ unavailable_since: new Date().toISOString(), unavailable_reason: dovod })
    .eq("id", accountId);
}

function bankaUcetNepozna(chyba: any): boolean {
  const t = String(chyba?.message ?? chyba ?? "");
  return /NO_ACCOUNT|Account does not exist/i.test(t);
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
        if (acc.unavailable_since) {
          console.log(
            `[bank-sync] účet ${acc.iban ?? acc.id} preskočený — ${acc.unavailable_reason ?? "banka ho nepozná"}`,
          );
          continue;
        }
        try {
          const r = await stiahniTransakcieUctu(supabaseAdmin, conn, accessToken, acc, daysBack);
          inserted += r.inserted;
        } catch (e: any) {
          chybneUcty.push(acc.iban ?? acc.id);
          if (bankaUcetNepozna(e)) {
            await oznacNedostupny(supabaseAdmin, acc.id, "Banka účet nepozná (NO_ACCOUNT).");
            console.error(
              `[bank-sync] účet ${acc.iban ?? acc.id}: banka ho nepozná, ďalej ho neskúšam`,
            );
          } else {
            console.error(`[bank-sync] účet ${acc.iban ?? acc.id} zlyhal:`, e?.message ?? e);
          }
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
