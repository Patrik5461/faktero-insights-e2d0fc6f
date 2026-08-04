import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listBankData, syncBankAccounts, disconnectBank } from "@/lib/faktero/tatrabanka.functions";
import { toast } from "sonner";
import {
  Building2,
  Plus,
  RefreshCw,
  Trash2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/bankove-ucty/")({
  head: () => ({ meta: [{ title: "Bankové účty — Faktero" }] }),
  component: BankAccountsPage,
});

function fmtMoney(n: number, c = "EUR") {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: c }).format(n);
}

function BankAccountsPage() {
  const list = useServerFn(listBankData);
  const syncAcc = useServerFn(syncBankAccounts);
  const disconnect = useServerFn(disconnectBank);
  const [data, setData] = useState<{ connections: any[]; accounts: any[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setData(await list({ data: { company_id: cid } }));
  }
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("connected")) toast.success("Banka pripojená");
    const err = url.searchParams.get("error");
    if (err) toast.error(`Pripojenie zlyhalo: ${err}`);
    if (url.searchParams.size) window.history.replaceState({}, "", url.pathname);
    reload();
  }, []);

  async function onSync(connId: string) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setBusy(connId);
    try {
      const r = await syncAcc({ data: { company_id: cid, connection_id: connId } });
      toast.success(`Synchronizovaných ${r.count} účtov`);
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba synchronizácie");
    } finally {
      setBusy(null);
    }
  }

  async function onDisconnect(connId: string) {
    if (!confirm("Naozaj odpojiť banku? Všetky účty a transakcie budú vymazané.")) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      await disconnect({ data: { company_id: cid, connection_id: connId } });
      toast.success("Odpojené");
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }

  const totalBalance = (data?.accounts ?? []).reduce((s, a) => s + Number(a.balance ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Bankové účty"
        description="Sandbox integrácia Tatra banka Premium API (Accounts). Iba na čítanie."
        action={
          <Link
            to="/bankove-ucty/pripojit"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" /> Pripojiť banku
          </Link>
        }
      />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4">
            <div className="text-xs uppercase tracking-wide text-emerald-700">Celkový zostatok</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-900">
              {fmtMoney(totalBalance)}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Počet účtov</div>
            <div className="mt-1 text-2xl font-semibold">{data?.accounts.length ?? 0}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Pripojenia</div>
            <div className="mt-1 text-2xl font-semibold">{data?.connections.length ?? 0}</div>
          </div>
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pripojené banky
        </h2>
        {data && data.connections.length === 0 && (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Žiadna banka nie je pripojená.</p>
            <Link
              to="/bankove-ucty/pripojit"
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" /> Pripojiť Tatra banku (sandbox)
            </Link>
          </div>
        )}
        <div className="mt-3 space-y-3">
          {data?.connections.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium capitalize">
                    {c.provider}
                    {c.status === "connected" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Pripojené
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <AlertCircle className="h-3 w-3" /> {c.status}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.last_synced_at
                      ? `Posledná synchronizácia: ${new Date(c.last_synced_at).toLocaleString("sk-SK")}`
                      : "Ešte nesynchronizované"}
                  </div>
                </div>
                <button
                  onClick={() => onSync(c.id)}
                  disabled={busy === c.id}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs hover:bg-secondary disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${busy === c.id ? "animate-spin" : ""}`} />{" "}
                  Načítať účty
                </button>
                <button
                  onClick={() => onDisconnect(c.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Odpojiť
                </button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {data.accounts
                  .filter((a) => a.bank_connection_id === c.id)
                  .map((a) => (
                    <div key={a.id} className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{a.account_name ?? a.iban ?? "Účet"}</div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {a.iban ?? "—"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold tabular-nums">
                            {fmtMoney(Number(a.balance ?? 0), a.currency)}
                          </div>
                          <Link
                            to="/bankove-ucty/transakcie"
                            search={{ account: a.id } as any}
                            className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
                          >
                            Transakcie <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                {data.accounts.filter((a) => a.bank_connection_id === c.id).length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    Žiadne účty — kliknite "Načítať účty".
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </PageBody>
    </>
  );
}
