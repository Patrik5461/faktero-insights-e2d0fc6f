/**
 * Nočné sťahovanie pre banky mimo Tatra banky — Wise, Revolut a Wallester.
 *
 * Prečo vlastný súbor a nie vetva v `bank-sync.server`: každá z týchto bánk si
 * prihlásenie stavia z tajomstiev, ktoré treba rozšifrovať
 * (`payment-crypto.server`, teda `node:crypto`). `bank-sync.server` je pritom
 * cez `import-vypisu.functions` dosiahnuteľný z prehliadačového balíka, takže
 * len čo si tú vetvu pritiahol, rollup skúsil zabaliť šifrovanie do
 * prehliadača a build spadol na `"createHash" is not exported by
 * "__vite-browser-external"`. Tento modul volá len hook, do prehliadača sa
 * nikdy nedostane.
 */

type Vysledok = {
  connection_id: string;
  company_id: string;
  provider: string;
  accounts: number;
  inserted: number;
  /** Meny alebo účty, ktoré neprešli — zvyšok pripojenia beží ďalej. */
  problemy?: string[];
  error?: string;
};

/** Banky, ktoré vie nočný beh stiahnuť sám. Tatra banka má vlastný beh. */
export const OSTATNE_BANKY = ["wise", "revolut", "wallester"];

/**
 * Sťahovanie jedného pripojenia. Prihlásenie si postaví ten modul, ktorý banke
 * rozumie: Wise podpisom, Revolut OAuth s obnovou tokenu, Wallester
 * podpísaným tokenom.
 */
async function syncJedno(conn: any): Promise<Vysledok> {
  const base = {
    connection_id: conn.id,
    company_id: conn.company_id,
    provider: conn.provider,
    accounts: 0,
    inserted: 0,
  };
  try {
    const r = await (async () => {
      if (conn.provider === "wise") {
        const { synchronizujWiseZoServera } = await import("./wise.server");
        return synchronizujWiseZoServera(conn.company_id);
      }
      if (conn.provider === "revolut") {
        const { synchronizujRevolutZoServera } = await import("./revolut.server");
        return synchronizujRevolutZoServera(conn.company_id);
      }
      const { synchronizujWallesterZoServera } = await import("./wallester.server");
      return synchronizujWallesterZoServera(conn.company_id);
    })();

    if (r.problemy.length) {
      console.warn(`[bank-sync] ${conn.provider} ${conn.id}: ${r.problemy.join(" · ")}`);
    }
    return {
      ...base,
      accounts: r.accounts,
      inserted: r.inserted,
      ...(r.problemy.length ? { problemy: r.problemy } : {}),
    };
  } catch (e: any) {
    const error = e?.message ?? "sync_failed";
    console.error(`[bank-sync] ${conn.provider} ${conn.id} zlyhalo:`, error);
    return { ...base, error };
  }
}

/**
 * Prejde všetky pripojené Wise, Revolut a Wallester účty.
 * Zlyhanie jednej banky nezhodí ostatné — zapíše sa do výsledku.
 */
export async function runDailySyncOstatnych() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: connections } = await supabaseAdmin
    .from("bank_connections")
    .select("*")
    .in("provider", OSTATNE_BANKY)
    .eq("status", "connected");

  const results: Vysledok[] = [];
  for (const conn of connections ?? []) results.push(await syncJedno(conn));

  const inserted = results.reduce((s, r) => s + r.inserted, 0);
  const failed = results.filter((r) => r.error).length;
  console.log(
    `[bank-sync] ostatné banky: ${results.length} pripojení, ${inserted} nových transakcií, ${failed} chýb`,
  );
  return { connections: results.length, inserted, failed, results };
}
