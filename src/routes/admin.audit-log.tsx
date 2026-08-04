import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { listAuditLogs } from "@/lib/faktero/admin.functions";

export const Route = createFileRoute("/admin/audit-log")({
  head: () => ({ meta: [{ title: "Admin · Audit log — Faktero" }] }),
  component: AdminAuditLogPage,
});

type Row = Awaited<ReturnType<typeof listAuditLogs>>["rows"][number];

function fmtDateTime(s: string) {
  try {
    return new Date(s).toLocaleString("sk-SK");
  } catch {
    return s;
  }
}

function AdminAuditLogPage() {
  const fetchLogs = useServerFn(listAuditLogs);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchLogs({ data: { page, pageSize } });
        if (!cancelled) {
          setRows(res.rows as Row[]);
          setTotal(res.total);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Chyba");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchLogs, page]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <AdminPageHeader
        title="Audit log"
        description="Záznamy o akciách platformových administrátorov."
      />
      <AdminPageBody>
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <ResponsiveTable
          items={rows}
          loading={loading}
          emptyText="Žiadne záznamy v audit logu."
          desktop={
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Kedy</th>
                    <th className="px-3 py-2">Admin</th>
                    <th className="px-3 py-2">Akcia</th>
                    <th className="px-3 py-2">Entita</th>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                        Načítavam…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                        Žiadne záznamy.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r: any) => (
                      <tr key={r.id} className="border-t border-border align-top hover:bg-muted/30">
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                          {fmtDateTime(r.created_at)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{r.admin_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.admin_email ?? "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                            {r.action}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{r.entity_type ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                          {r.entity_id ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <pre className="max-w-md overflow-x-auto rounded bg-muted/40 p-2 text-[10px] text-muted-foreground">
                            {JSON.stringify(r.metadata ?? {}, null, 0)}
                          </pre>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          }
          mobileCard={(r: any) => (
            <MobileListCard
              title={r.action}
              subtitle={`${r.admin_email ?? "—"} · ${r.entity_type ?? "—"}`}
              meta={fmtDateTime(r.created_at)}
            />
          )}
        />

        {total > pageSize && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Strana {page} z {pages} · {total} záznamov
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50"
              >
                ← Späť
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50"
              >
                Ďalej →
              </button>
            </div>
          </div>
        )}
      </AdminPageBody>
    </>
  );
}
