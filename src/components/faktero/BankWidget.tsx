import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Landmark, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { zostatkyPodlaMien, formatujSumu } from "@/lib/faktero/zostatky";

export function BankWidget() {
  const [accounts, setAccounts] = useState<any[] | null>(null);
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase
      .from("bank_accounts")
      .select("id, iban, account_name, currency, balance, last_synced_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: true })
      .then(({ data }) => setAccounts(data ?? []));
  }, []);

  // Meny sa nemiešajú do jedného čísla — každá má vlastný riadok.
  const zostatky = zostatkyPodlaMien(accounts ?? []);
  const lastSync = (accounts ?? []).reduce<string | null>((m, a) => {
    if (!a.last_synced_at) return m;
    if (!m || a.last_synced_at > m) return a.last_synced_at;
    return m;
  }, null);

  return (
    <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          <Landmark className="h-3.5 w-3.5" /> Bankový účet
        </div>
        <Link
          to="/bankove-ucty"
          className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 hover:underline"
        >
          Detail <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {accounts === null ? (
        <div className="mt-3 h-6 w-32 animate-pulse rounded bg-emerald-100" />
      ) : accounts.length === 0 ? (
        <div className="mt-3 text-sm text-muted-foreground">
          Žiadny bankový účet.{" "}
          <Link to="/bankove-ucty/pripojit" className="text-emerald-700 dark:text-emerald-300 hover:underline">
            Pripojiť banku
          </Link>
        </div>
      ) : (
        <>
          {zostatky.map((z) => (
            <div key={z.mena} className="mt-2 text-2xl font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
              {formatujSumu(z.suma, z.mena)}
            </div>
          ))}
          <div className="text-xs text-muted-foreground">
            Aktuálny zostatok · {accounts.length} účtov
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Posledná synchronizácia:{" "}
            {lastSync ? new Date(lastSync).toLocaleString("sk-SK") : "nikdy"}
          </div>
        </>
      )}
    </div>
  );
}
