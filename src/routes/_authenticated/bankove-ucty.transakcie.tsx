import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listBankData, syncBankTransactions } from "@/lib/faktero/tatrabanka.functions";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Link2, Unlink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { zrusParovanie } from "@/lib/faktero/parovanie.functions";
import { usePagedLogs } from "@/hooks/usePagedLogs";
import { EmptyState, ListFooter, LogsToolbar } from "@/components/faktero/ListControls";
import { Landmark } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bankove-ucty/transakcie")({
  head: () => ({ meta: [{ title: "Bankové transakcie — Faktero" }] }),
  validateSearch: (s: Record<string, unknown>): { account?: string } => ({
    account: typeof s.account === "string" ? s.account : undefined,
  }),
  component: TxPage,
});

function fmtMoney(n: number, c = "EUR") {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: c }).format(n);
}

function TxPage() {
  const search = Route.useSearch();
  const fetchData = useServerFn(listBankData);
  const sync = useServerFn(syncBankTransactions);
  const zrus = useServerFn(zrusParovanie);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | undefined>(search.account);
  const [busy, setBusy] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const {
    rows: txs,
    total,
    loading,
    page,
    setPage,
    pageSize,
    setPageSize,
    search: q,
    setSearch: setQ,
    reload,
  } = usePagedLogs({
    resource: "bank_transactions",
    // `iban` tu nikdy nebol — hľadanie kvôli nemu končilo chybou 400 a
    // nenašlo nič. Referencia pohybu je to, čo sa naozaj dá hľadať.
    searchColumns: ["counterparty", "variable_symbol", "description", "transaction_reference"],
    filters: { bank_account_id: selected ?? null },
    dateColumn: "booking_date",
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    orderBy: { column: "booking_date", ascending: false },
    pageSizeKey: "bank_transactions",
  });

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    fetchData({ data: { company_id: cid } }).then((d) => {
      setAccounts(d.accounts);
      if (!selected && d.accounts[0]) setSelected(d.accounts[0].id);
    });
  }, []);

  /* K spárovaným pohybom dotiahneme číslo faktúry — samotné id nikomu nič nepovie. */
  const [faktury, setFaktury] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = txs.map((t: any) => t.matched_invoice_id).filter(Boolean);
    if (ids.length === 0) return setFaktury({});
    supabase
      .from("invoices")
      .select("id, invoice_number")
      .in("id", ids)
      .then(({ data }) =>
        setFaktury(Object.fromEntries((data ?? []).map((f: any) => [f.id, f.invoice_number]))),
      );
  }, [txs]);

  async function odparuj(id: string) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      await zrus({ data: { companyId: cid, transactionId: id } });
      toast.success("Párovanie zrušené, faktúra je znovu otvorená.");
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa zrušiť párovanie.");
    }
  }

  async function onSync() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    // Pri voľbe „Všetky účty" nie je vybratý žiadny účet — vtedy sa
    // synchronizujú všetky, inak by tlačidlo nespravilo vôbec nič.
    const ids = selected ? [selected] : accounts.map((a) => a.id);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      let inserted = 0;
      let total = 0;
      const chyby: string[] = [];
      for (const id of ids) {
        try {
          const r = await sync({ data: { company_id: cid, account_id: id } });
          inserted += r.inserted;
          total += r.total;
        } catch (e: any) {
          chyby.push(accounts.find((a) => a.id === id)?.iban ?? id);
        }
      }
      if (chyby.length) toast.error(`Nepodarilo sa načítať: ${chyby.join(", ")}`);
      else toast.success(`Synchronizovaných ${inserted} nových z ${total}`);
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Bankové transakcie"
        description="Posledných 90 dní z Tatra banky."
        action={
          <Link
            to="/bankove-ucty"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
        }
      />
      <PageBody>
        <LogsToolbar
          search={q}
          onSearchChange={setQ}
          searchPlaceholder="Hľadať protistranu, VS alebo popis…"
          selects={[
            {
              label: "Účet",
              value: selected ?? "",
              onChange: (v) => setSelected(v || undefined),
              options: [
                { value: "", label: "Všetky účty" },
                ...accounts.map((a) => ({ value: a.id, label: a.account_name ?? a.iban ?? a.id })),
              ],
            },
          ]}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onReset={() => {
            setQ("");
            setDateFrom("");
            setDateTo("");
          }}
          right={
            <div className="flex gap-2">
              <Link
                to="/faktury/parovanie"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary"
              >
                <Link2 className="h-4 w-4" /> Spárovať s faktúrami
              </Link>
              <button
                onClick={onSync}
                disabled={accounts.length === 0 || busy}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Synchronizovať
              </button>
            </div>
          }
        />

        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Dátum</th>
                <th className="px-3 py-2">Protistrana</th>
                <th className="px-3 py-2">VS</th>
                <th className="px-3 py-2">Popis</th>
                <th className="px-3 py-2">Faktúra</th>
                <th className="px-3 py-2 text-right">Suma</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-2 tabular-nums">{t.booking_date}</td>
                  <td className="px-3 py-2">{t.counterparty ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{t.variable_symbol ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.description ?? "—"}</td>
                  <td className="px-3 py-2">
                    {t.matched_invoice_id ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Link
                          to="/faktury/$id"
                          params={{ id: t.matched_invoice_id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {faktury[t.matched_invoice_id] ?? "faktúra"}
                        </Link>
                        <button
                          onClick={() => odparuj(t.id)}
                          title="Zrušiť párovanie a vrátiť faktúru medzi otvorené"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : Number(t.amount) > 0 ? (
                      <span className="text-xs text-muted-foreground">nespárované</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-medium ${Number(t.amount) < 0 ? "text-destructive" : "text-emerald-700"}`}
                  >
                    {fmtMoney(Number(t.amount), t.currency)}
                  </td>
                </tr>
              ))}
              {!loading && txs.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={Landmark}
                      title="Žiadne transakcie"
                      description="Pre vybraté obdobie a filtre nemáme žiadne výsledky."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <ListFooter
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </PageBody>
    </>
  );
}
