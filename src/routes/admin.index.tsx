import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { getAdminOverview } from "@/lib/faktero/admin.functions";
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
} from "lucide-react";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Admin · Prehľad — Faktero" }] }),
  component: AdminOverviewPage,
});

type Stats = Awaited<ReturnType<typeof getAdminOverview>>;

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
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchOverview();
        if (!cancelled) setData(res);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Chyba pri načítaní");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchOverview]);

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
      </AdminPageBody>
    </>
  );
}