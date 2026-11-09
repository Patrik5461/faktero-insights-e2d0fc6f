import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ListPagination, useStoredPageSize } from "@/components/faktero/ListControls";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";
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
  // Predvolene 10 na stranu, na výber 10/20/50/100 (Patrik 9. 11.).
  const [pageSize, setPageSize] = useStoredPageSize("admin-audit-log");
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
  }, [fetchLogs, page, pageSize]);


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
                      <KlikatelnyRiadok key={r.id} ciel={cielZaznamu(r)} className="border-t border-border align-top">
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
                      </KlikatelnyRiadok>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          }
          mobileCard={(r: any) => (
            <MobileListCard
              ciel={cielZaznamu(r)}
              title={r.action}
              subtitle={`${r.admin_email ?? "—"} · ${r.entity_type ?? "—"}`}
              meta={fmtDateTime(r.created_at)}
            />
          )}
        />

        {total > 0 && (
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        )}
      </AdminPageBody>
    </>
  );
}

/** Záznam o firme alebo používateľovi vedie na ich detail v admine; ostatné záznamy detail nemajú. */
function cielZaznamu(r: { entity_type?: string | null; entity_id?: string | null }) {
  if (!r.entity_id) return null;
  if (r.entity_type === "company") return { to: "/admin/companies/$id" as const, params: { id: r.entity_id } };
  if (r.entity_type === "user") return { to: "/admin/users/$id" as const, params: { id: r.entity_id } };
  return null;
}
