import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Landmark, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { zostatkyPodlaMien, formatujSumu } from "@/lib/faktero/zostatky";

export function BankWidget() {
  const { t, jazyk } = useT();
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
    /* Redizajn: bez zeleného prechodu farieb — karta ako ostatné, zelená len v ikone a odkaze. */
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Landmark className="h-3.5 w-3.5" />
          </span>
          {t("Bankový účet")}
        </div>
        <Link
          to="/bankove-ucty"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover hover:underline"
        >
          {t("Detail")} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {accounts === null ? (
        <div className="mt-3 h-7 w-40 animate-pulse rounded bg-muted" />
      ) : accounts.length === 0 ? (
        <div className="mt-3 text-sm text-muted-foreground">
          {t("Žiadny bankový účet.")}{" "}
          <Link
            to="/bankove-ucty/pripojit"
            className="font-semibold text-primary hover:text-primary-hover hover:underline"
          >
            {t("Pripojiť banku")}
          </Link>
        </div>
      ) : (
        <>
          {zostatky.map((z) => (
            <div
              key={z.mena}
              className="suma mt-2 text-2xl font-bold tracking-tight"
            >
              {formatujSumu(z.suma, z.mena)}
            </div>
          ))}
          <div className="text-xs text-muted-foreground">
            {t("Aktuálny zostatok")} ·{" "}
            {t(accounts.length === 1 ? "{n} účet" : accounts.length < 5 ? "{n} účty" : "{n} účtov", { n: accounts.length })}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {t("Posledná synchronizácia:")}{" "}
            {lastSync ? new Date(lastSync).toLocaleString(lokalJazyka(jazyk)) : t("nikdy")}
          </div>
        </>
      )}
    </div>
  );
}
