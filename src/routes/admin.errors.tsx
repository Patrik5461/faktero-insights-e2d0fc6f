import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { listAdminErrors } from "@/lib/faktero/admin.functions";

export const Route = createFileRoute("/admin/errors")({
  head: () => ({ meta: [{ title: "Admin · Chyby — Faktero" }] }),
  component: AdminErrorsPage,
});

type Source = "all" | "api" | "webhook" | "email" | "finstat" | "efaktura";
type Row = Awaited<ReturnType<typeof listAdminErrors>>["rows"][number];

const SOURCES: { value: Source; label: string }[] = [
  { value: "all", label: "Všetko" },
  { value: "api", label: "API" },
  { value: "webhook", label: "Webhooky" },
  { value: "email", label: "E-maily" },
  { value: "finstat", label: "FinStat" },
  { value: "efaktura", label: "eFaktúra" },
];

const SOURCE_COLOR: Record<string, string> = {
  api: "bg-destructive/15 text-destructive",
  webhook: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  email: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  finstat: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  efaktura: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

function fmtDateTime(s: string) {
  try { return new Date(s).toLocaleString("sk-SK"); } catch { return s; }
}

function AdminErrorsPage() {
  const fetchErrors = useServerFn(listAdminErrors);
  const [source, setSource] = useState<Source>("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchErrors({ data: { source, limit: 100 } });
        if (!cancelled) setRows(res.rows);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Chyba");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchErrors, source]);

  return (
    <>
      <AdminPageHeader
        title="Chyby"
        description="Posledné zlyhania v rôznych subsystémoch platformy."
      />
      <AdminPageBody>
        <div className="mb-4 flex flex-wrap gap-1">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              onClick={() => setSource(s.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                source === s.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading && rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Načítavam…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Žiadne nedávne chyby.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li
                key={`${r.source}-${r.created_at}-${i}`}
                className="rounded-xl border border-border bg-card p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${SOURCE_COLOR[r.source] ?? "bg-muted"}`}
                      >
                        {r.source}
                      </span>
                      {r.status != null && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono">
                          {String(r.status)}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</span>
                    </div>
                    <div className="mt-1 text-sm font-medium">{r.summary}</div>
                    {r.detail && (
                      <div className="mt-1 break-words text-xs text-muted-foreground">
                        {r.detail.length > 240 ? r.detail.slice(0, 240) + "…" : r.detail}
                      </div>
                    )}
                    {r.company_id && (
                      <div className="mt-1 text-[10px] font-mono text-muted-foreground">
                        company: {r.company_id}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminPageBody>
    </>
  );
}