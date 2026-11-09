import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ListPagination, useStoredPageSize } from "@/components/faktero/ListControls";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";
import { getAdminUsage } from "@/lib/faktero/admin.functions";

export const Route = createFileRoute("/admin/usage")({
  head: () => ({ meta: [{ title: "Admin · Využitie — Faktero" }] }),
  component: AdminUsagePage,
});

type Row = Awaited<ReturnType<typeof getAdminUsage>>["rows"][number];

function AdminUsagePage() {
  const fetchUsage = useServerFn(getAdminUsage);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // Predvolene 10 na stranu, na výber 10/20/50/100 (Patrik 9. 11.).
  const [pageSize, setPageSize] = useStoredPageSize("admin-vyuzitie");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchUsage();
        if (!cancelled) setRows(res.rows);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Chyba");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchUsage]);

  const total = rows.length;
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <AdminPageHeader
        title="Využitie platformy"
        description="Mesačné využitie podľa firiem (od začiatku aktuálneho mesiaca)."
      />
      <AdminPageBody>
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <ResponsiveTable
          items={slice}
          loading={loading}
          emptyText="Tento mesiac zatiaľ žiadne dáta."
          desktop={
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Firma</th>
                    <th className="px-3 py-2 text-right">Faktúry</th>
                    <th className="px-3 py-2 text-right">PDF</th>
                    <th className="px-3 py-2 text-right">API</th>
                    <th className="px-3 py-2 text-right">E-maily</th>
                    <th className="px-3 py-2 text-right">Webhooky</th>
                    <th className="px-3 py-2 text-right">Úložisko</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && slice.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                        Načítavam…
                      </td>
                    </tr>
                  ) : slice.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                        Tento mesiac zatiaľ žiadne dáta.
                      </td>
                    </tr>
                  ) : (
                    slice.map((r) => (
                      <KlikatelnyRiadok key={r.company_id} ciel={{ to: "/admin/companies/$id", params: { id: r.company_id } }} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">
                          <Link to="/admin/companies/$id" params={{ id: r.company_id }} className="hover:underline">
                            {r.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.invoices}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.pdfs}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.api_calls}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.emails}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.webhooks}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {r.storage_mb == null ? "—" : `${r.storage_mb} MB`}
                        </td>
                      </KlikatelnyRiadok>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          }
          mobileCard={(r) => (
            <MobileListCard
              ciel={{ to: "/admin/companies/$id", params: { id: r.company_id } }}
              title={r.name}
              meta={`Faktúry ${r.invoices} · PDF ${r.pdfs} · API ${r.api_calls} · E-maily ${r.emails} · Webhooky ${r.webhooks}`}
              amount={r.storage_mb == null ? "—" : `${r.storage_mb} MB`}
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

        <p className="mt-6 text-xs text-muted-foreground">
          Počet PDF generovaní odhadujeme z vystavených faktúr. Veľkosť úložiska zatiaľ nie je
          merana per firma.
        </p>
      </AdminPageBody>
    </>
  );
}
