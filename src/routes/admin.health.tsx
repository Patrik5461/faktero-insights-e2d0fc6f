import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { getSystemHealth } from "@/lib/faktero/admin-health.functions";
import { CheckCircle2, AlertTriangle, XCircle, Info, RefreshCw, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/health")({
  head: () => ({ meta: [{ title: "Admin · Health check — Faktero" }] }),
  component: AdminHealthPage,
});

type Data = Awaited<ReturnType<typeof getSystemHealth>>;

const STATUS_META: Record<string, { icon: any; cls: string; label: string }> = {
  ok: {
    icon: CheckCircle2,
    cls: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    label: "OK",
  },
  warn: {
    icon: AlertTriangle,
    cls: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
    label: "WARN",
  },
  fail: {
    icon: XCircle,
    cls: "text-destructive bg-destructive/10 border-destructive/30",
    label: "FAIL",
  },
  info: { icon: Info, cls: "text-muted-foreground bg-muted border-border", label: "INFO" },
};

function AdminHealthPage() {
  const fetchHealth = useServerFn(getSystemHealth);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchHealth();
      setData(res);
    } catch (e: any) {
      setError(e?.message ?? "Chyba načítania");
    } finally {
      setLoading(false);
    }
  }, [fetchHealth]);

  useEffect(() => {
    load();
  }, [load]);

  const groups: { title: string; prefix: (k: string) => boolean }[] = [
    {
      title: "Infraštruktúra",
      prefix: (k) => ["db", "auth_admin", "storage", "service_role_any"].includes(k),
    },
    {
      title: "Core secrets",
      prefix: (k) => /^(SUPABASE_|FAKTERO_|APP_PUBLIC_URL|PAYMENT_SECRETS_KEY|COMMANDER_)/.test(k),
    },
    { title: "Integrácie", prefix: (k) => k.startsWith("int_") },
    {
      title: "Prevádzka (24h)",
      prefix: (k) =>
        k.endsWith("_24h") ||
        k === "cron" ||
        k === "errors_24h" ||
        k === "efa_pending" ||
        k === "efa_profiles" ||
        k === "efa_status",
    },
  ];

  return (
    <>
      <AdminPageHeader
        title="Health check"
        description="Stav systému, secrets, integrácií a posledných chýb."
        action={
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Obnoviť
          </button>
        }
      />
      <AdminPageBody>
        {error && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {data && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["ok", "warn", "fail", "info"] as const).map((k) => {
              const M = STATUS_META[k];
              const Icon = M.icon;
              return (
                <div key={k} className={`rounded-lg border px-4 py-3 ${M.cls}`}>
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider">
                    <Icon className="h-4 w-4" /> {M.label}
                  </div>
                  <div className="mt-1 text-2xl font-semibold">{(data.summary as any)[k]}</div>
                </div>
              );
            })}
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {groups.map((g) => {
              const items = data.checks.filter((c) => g.prefix(c.key));
              if (!items.length) return null;
              return (
                <section key={g.title}>
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.title}
                  </h2>
                  <div className="overflow-hidden rounded-lg border border-border bg-card">
                    <table className="w-full text-sm">
                      <tbody>
                        {items.map((c) => {
                          const M = STATUS_META[c.status];
                          const Icon = M.icon;
                          return (
                            <tr key={c.key} className="border-b border-border last:border-0">
                              <td className="w-10 py-2.5 pl-3">
                                <Icon className={`h-4 w-4 ${M.cls.split(" ")[0]}`} />
                              </td>
                              <td className="py-2.5 pr-3 font-medium">{c.label}</td>
                              <td className="py-2.5 pr-3 text-muted-foreground">{c.message}</td>
                              <td className="py-2.5 pr-3 text-right">
                                <span
                                  className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold ${M.cls}`}
                                >
                                  {M.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {data && (
          <p className="mt-6 text-xs text-muted-foreground">
            Vygenerované: {new Date(data.summary.generated_at).toLocaleString("sk-SK")} ·{" "}
            {data.summary.duration_ms} ms
          </p>
        )}
      </AdminPageBody>
    </>
  );
}
