import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { getAdminOverview } from "@/lib/faktero/admin.functions";
import { getSupabaseUsage } from "@/lib/faktero/admin-usage.functions";
import {
  Building2,
  Users,
  CheckCircle2,
  PauseCircle,
  FileText,
  Activity,
  Mail,
  AlertTriangle,
  Banknote,
  Clock,
  Database,
  HardDrive,
  Table2,
} from "lucide-react";

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes ?? 0} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function UsageBar({
  icon: Icon,
  label,
  used,
  limit,
}: {
  icon: any;
  label: string;
  used: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const tone = pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Icon className="h-4 w-4" />
          {label}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="mt-2 text-lg font-semibold tabular-nums">
        {formatBytes(used)}{" "}
        <span className="text-sm font-normal text-muted-foreground">
          / {formatBytes(limit)}
        </span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Admin · Prehľad — Faktero" }] }),
  component: AdminOverviewPage,
});

type Stats = Awaited<ReturnType<typeof getAdminOverview>>;
type Usage = Awaited<ReturnType<typeof getSupabaseUsage>>;

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: any;
  label: string;
  value: string | number | null;
  hint?: string;
  tone?: "default" | "warn" | "muted";
}) {
  const toneCls =
    tone === "warn"
      ? "text-destructive"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon className={`h-4 w-4 ${toneCls}`} />
      </div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${toneCls}`}>
        {value === null ? "—" : value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function AdminOverviewPage() {
  const fetchOverview = useServerFn(getAdminOverview);
  const fetchUsage = useServerFn(getSupabaseUsage);
  const [data, setData] = useState<Stats | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [res, u] = await Promise.all([
          fetchOverview(),
          fetchUsage().catch((e) => {
            console.error("usage fetch failed", e);
            return null;
          }),
        ]);
        if (!cancelled) {
          setData(res);
          setUsage(u as Usage | null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Chyba pri načítaní");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchOverview, fetchUsage]);

  const suspendedCount =
    data ? data.totalCompanies - data.activeCompanies : null;

  return (
    <>
      <AdminPageHeader
        title="Platform prehľad"
        description="Kľúčové metriky o stave Faktero platformy."
      />
      <AdminPageBody>
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}
        {loading && !data ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-xl border border-border bg-card"
              />
            ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Building2} label="Firmy" value={data.totalCompanies} />
            <StatCard icon={Users} label="Používatelia" value={data.totalUsers} />
            <StatCard
              icon={CheckCircle2}
              label="Aktívne firmy"
              value={data.activeCompanies}
            />
            <StatCard
              icon={PauseCircle}
              label="Pozastavené"
              value={suspendedCount ?? 0}
              tone={suspendedCount && suspendedCount > 0 ? "warn" : "muted"}
            />
            <StatCard
              icon={FileText}
              label="Faktúry / mesiac"
              value={data.invoicesMonth}
            />
            <StatCard
              icon={Activity}
              label="API volania / mesiac"
              value={data.apiMonth}
            />
            <StatCard
              icon={Mail}
              label="E-maily / mesiac"
              value={data.emailsMonth}
            />
            <StatCard
              icon={AlertTriangle}
              label="Zlyhané webhooky"
              value={data.failedWebhooks}
              tone={data.failedWebhooks > 0 ? "warn" : "muted"}
            />
            <StatCard
              icon={Banknote}
              label="MRR"
              value={data.revenueCents}
              hint="GoPay zatiaľ neaktívne"
              tone="muted"
            />
            <StatCard
              icon={Clock}
              label="Trial účty"
              value={data.trialAccounts}
              hint="Pripravené po spustení GoPay"
              tone="muted"
            />
          </div>
        ) : null}

        {usage && (
          <div className="mt-8 space-y-4">
            <h2 className="text-lg font-semibold">Supabase využitie</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <UsageBar
                icon={Database}
                label="Databáza (Free 500 MB)"
                used={usage.db.used_bytes}
                limit={usage.db.limit_bytes}
              />
              <UsageBar
                icon={HardDrive}
                label="Storage (Free 1 GB)"
                used={usage.storage.used_bytes}
                limit={usage.storage.limit_bytes}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Table2 className="h-4 w-4 text-muted-foreground" />
                  Top 5 najväčších tabuliek
                </div>
                <div className="space-y-2">
                  {usage.db.tables.slice(0, 5).map((t) => {
                    const pct =
                      usage.db.used_bytes > 0
                        ? (t.size_bytes / usage.db.used_bytes) * 100
                        : 0;
                    return (
                      <div key={t.table} className="text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs">{t.table}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {t.size_pretty}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary/60"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {usage.db.tables.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      Dáta nedostupné.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Počty záznamov
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(usage.row_counts).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {k}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {v.toLocaleString("sk-SK")}
                      </span>
                    </div>
                  ))}
                </div>

                {usage.storage.buckets.length > 0 && (
                  <>
                    <div className="mt-4 mb-2 flex items-center gap-2 text-sm font-medium">
                      <HardDrive className="h-4 w-4 text-muted-foreground" />
                      Storage buckety
                    </div>
                    <div className="space-y-1 text-sm">
                      {usage.storage.buckets.map((b) => (
                        <div
                          key={b.name}
                          className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5"
                        >
                          <span className="font-mono text-xs">{b.name}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {b.files} · {formatBytes(b.size_bytes)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </AdminPageBody>
    </>
  );
}