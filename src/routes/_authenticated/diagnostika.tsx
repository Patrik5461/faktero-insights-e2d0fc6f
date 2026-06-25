import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getRecurringDiagnostics } from "@/lib/faktero/recurring.functions";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/diagnostika")({
  head: () => ({ meta: [{ title: "Diagnostika — Faktero" }] }),
  component: DiagnostikaPage,
});

function DiagnostikaPage() {
  const fetchDiag = useServerFn(getRecurringDiagnostics);
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchDiag();
      setData(r);
    } catch (e: any) {
      setErr(e?.message ?? "Chyba pri načítaní");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Načítavam…</div>;
  if (err) return <div className="p-6 text-sm text-destructive">{err}</div>;

  const cron = data?.cron ?? {};
  const runs: any[] = data?.last_runs ?? [];
  const logs: any[] = data?.recent_logs ?? [];
  const lastRun = runs[0];

  return (
    <>
      <PageHeader title="Diagnostika" description="Stav automatického spúšťania opakovaných faktúr" />
      <PageBody>
        <div className="mb-4 flex items-center justify-between">
          <Link to="/opakovane" className="text-sm text-primary hover:underline">← Opakované faktúry</Link>
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/60">
            <RefreshCw className="h-3.5 w-3.5" /> Obnoviť
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card title="Cron stav" icon={Activity}>
            {cron.configured ? (
              <>
                <Row k="Job" v={cron.jobname} />
                <Row k="Plán" v={cron.schedule ?? "—"} />
                <Row k="Aktívny" v={cron.active ? "Áno" : "Nie"} />
              </>
            ) : (
              <div className="text-sm text-destructive">Cron nie je nakonfigurovaný.</div>
            )}
          </Card>

          <Card title="Posledné spustenie" icon={Clock}>
            {lastRun ? (
              <>
                <Row k="Čas" v={new Date(lastRun.start_time).toLocaleString("sk-SK")} />
                <Row k="Stav" v={lastRun.status} />
                <Row k="Správa" v={lastRun.return_message ?? "—"} />
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Zatiaľ žiadne spustenie.</div>
            )}
          </Card>

          <Card title="Chyby (7 dní)" icon={AlertTriangle}>
            <div className="text-3xl font-semibold tabular-nums">{data?.failed_7d ?? 0}</div>
            <div className="mt-1 text-xs text-muted-foreground">neúspešných generovaní</div>
          </Card>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card title="Posledné cron behy" icon={Activity}>
            {runs.length === 0 ? (
              <div className="text-sm text-muted-foreground">Žiadne záznamy.</div>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {runs.map((r, i) => (
                  <li key={i} className="flex items-center justify-between py-2">
                    <div className="min-w-0">
                      <div className="font-medium">{new Date(r.start_time).toLocaleString("sk-SK")}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.return_message ?? "—"}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${r.status === "succeeded" ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>{r.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Posledné generovania" icon={CheckCircle2}>
            {logs.length === 0 ? (
              <div className="text-sm text-muted-foreground">Žiadne záznamy.</div>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {logs.map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-2">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {new Date(l.created_at).toLocaleString("sk-SK")}
                        <span className="ml-2 text-xs text-muted-foreground">({l.run_type})</span>
                      </div>
                      {l.error_message && <div className="truncate text-xs text-destructive">{l.error_message}</div>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${l.status === "success" ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>{l.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <div className="flex items-baseline justify-between py-1 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="ml-2 truncate font-medium">{String(v)}</span>
    </div>
  );
}