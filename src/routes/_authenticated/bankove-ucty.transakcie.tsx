import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listBankData, syncBankTransactions } from "@/lib/faktero/tatrabanka.functions";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw } from "lucide-react";
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
    searchColumns: ["counterparty", "variable_symbol", "description", "iban"],
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

  async function onSync() {
    const cid = getActiveCompanyId();
    if (!cid || !selected) return;
    setBusy(true);
    try {
      const r = await sync({ data: { company_id: cid, account_id: selected } });
      toast.success(`Synchronizovaných ${r.inserted} nových z ${r.total}`);
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
        description="Posledných 90 dní zo sandbox prostredia Tatra banky."
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
          searchPlaceholder="Hľadať protistranu, VS, IBAN alebo popis…"
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
            <button
              onClick={onSync}
              disabled={!selected || busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Synchronizovať
            </button>
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
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-medium ${Number(t.amount) < 0 ? "text-destructive" : "text-emerald-700"}`}
                  >
                    {fmtMoney(Number(t.amount), t.currency)}
                  </td>
                </tr>
              ))}
              {!loading && txs.length === 0 && (
                <tr>
                  <td colSpan={5}>
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
